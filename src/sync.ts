import { logger } from './logger.js'
import { RedbarkClient } from './redbark-client.js'
import { SureClient } from './sure-client.js'
import { transformTransactions } from './transform.js'
import { extractDedupKeys, buildFingerprintSet, isDuplicate } from './dedup.js'
import type { Config } from './config.js'
import type { SyncResult } from './types.js'

/**
 * Run the full sync pipeline:
 * 1. Validate both APIs and account mappings
 * 2. For each mapping: fetch existing → dedup → transform → create
 */
export async function runSync(config: Config): Promise<SyncResult[]> {
  const redbark = new RedbarkClient(config.redbarkApiKey, config.redbarkApiUrl)
  const sure = new SureClient({ url: config.sureUrl, apiKey: config.sureApiKey })

  // Validate Redbark connection
  logger.info('Connecting to Redbark API...')
  const redbarkAccounts = await redbark.listAccounts()
  logger.info(
    { accountCount: redbarkAccounts.length },
    `Connected to Redbark API (${redbarkAccounts.length} accounts)`
  )

  const redbarkAccountMap = new Map(redbarkAccounts.map((a) => [a.id, a]))

  for (const mapping of config.accountMapping) {
    const account = redbarkAccountMap.get(mapping.redbarkAccountId)
    if (!account) {
      throw new Error(
        `Redbark account ID '${mapping.redbarkAccountId}' not found.\n` +
          '  → Run with --list-redbark-accounts to see available accounts.'
      )
    }
  }

  // Validate Sure connection
  logger.info('Connecting to Sure API...')
  const sureAccounts = await sure.listAccounts()
  logger.info(
    { accountCount: sureAccounts.length },
    `Connected to Sure API (${sureAccounts.length} accounts)`
  )

  const sureAccountMap = new Map(sureAccounts.map((a) => [a.id, a]))

  for (const mapping of config.accountMapping) {
    if (!sureAccountMap.has(mapping.sureAccountId)) {
      throw new Error(
        `Sure account ID '${mapping.sureAccountId}' not found.\n` +
          '  → Run with --list-sure-accounts to see available accounts.'
      )
    }
  }

  // Resolve optional category mapping
  if (config.categoryMapping) {
    const categories = await sure.listCategories()
    const categoryIds = new Set(categories.map((c) => c.id))
    for (const [name, id] of config.categoryMapping) {
      if (!categoryIds.has(id)) {
        logger.warn(
          { category: name, id },
          `Category ID '${id}' (mapped from '${name}') not found in Sure`
        )
      }
    }
  }

  // Resolve optional tag
  let tagIds: string[] | undefined
  if (config.tagName) {
    const tags = await sure.listTags()
    const matchingTag = tags.find(
      (t) => t.name.toLowerCase() === config.tagName!.toLowerCase()
    )
    if (matchingTag) {
      tagIds = [matchingTag.id]
      logger.info({ tagId: matchingTag.id, tagName: matchingTag.name }, 'Resolved tag')
    } else {
      logger.warn(
        { tagName: config.tagName },
        `Tag '${config.tagName}' not found in Sure. Transactions will be created without a tag.`
      )
    }
  }

  // Calculate date range
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - config.syncDays)
  const fromStr = from.toISOString().split('T')[0]!
  const toStr = to.toISOString().split('T')[0]!

  logger.info({ from: fromStr, to: toStr, days: config.syncDays }, 'Sync window')

  const results: SyncResult[] = []

  // Sync each account mapping
  for (const mapping of config.accountMapping) {
    const redbarkAccount = redbarkAccountMap.get(mapping.redbarkAccountId)!
    const sureAccount = sureAccountMap.get(mapping.sureAccountId)!

    logger.info(`Syncing: ${redbarkAccount.name} → ${sureAccount.name}`)

    // 1. Fetch existing Sure transactions for dedup
    const existingSureTxns = await sure.listTransactions({
      accountId: mapping.sureAccountId,
      startDate: fromStr,
      endDate: toStr,
    })

    const existingKeys = extractDedupKeys(existingSureTxns)
    const existingFingerprints = buildFingerprintSet(existingSureTxns)

    logger.debug(
      { existing: existingSureTxns.length, keys: existingKeys.size, fingerprints: existingFingerprints.size },
      'Built dedup sets'
    )

    // 2. Fetch transactions from Redbark
    const redbarkTxns = await redbark.getTransactions({
      connectionId: redbarkAccount.connectionId,
      accountId: redbarkAccount.id,
      from: fromStr,
      to: toStr,
    })

    logger.info(
      { count: redbarkTxns.length },
      `Fetched ${redbarkTxns.length} transactions (${config.syncDays} days)`
    )

    // 3. Filter to posted only
    const postedTxns = redbarkTxns.filter((txn) => txn.status === 'posted')

    // 4. Dedup
    const newTxns = postedTxns.filter(
      (txn) => !isDuplicate(txn, existingKeys, existingFingerprints)
    )

    const skipped = postedTxns.length - newTxns.length

    logger.info(
      { posted: postedTxns.length, new: newTxns.length, skipped },
      `${newTxns.length} new transactions to create (${skipped} already exist)`
    )

    if (newTxns.length === 0) {
      results.push({
        redbarkAccountId: mapping.redbarkAccountId,
        sureAccountId: mapping.sureAccountId,
        accountName: redbarkAccount.name,
        fetched: redbarkTxns.length,
        created: 0,
        skipped,
        errors: 0,
      })
      continue
    }

    if (config.dryRun) {
      logger.info(
        `[DRY RUN] Would create ${newTxns.length} transactions in '${sureAccount.name}'`
      )
      results.push({
        redbarkAccountId: mapping.redbarkAccountId,
        sureAccountId: mapping.sureAccountId,
        accountName: redbarkAccount.name,
        fetched: redbarkTxns.length,
        created: newTxns.length,
        skipped,
        errors: 0,
      })
      continue
    }

    // 5. Transform and create
    const sureTxns = transformTransactions(newTxns, mapping.sureAccountId, {
      categoryMapping: config.categoryMapping,
      tagIds,
      currency: config.currency,
    })

    let created = 0
    let errors = 0

    for (const sureTxn of sureTxns) {
      try {
        await sure.createTransaction(sureTxn)
        created++

        if (created % config.batchSize === 0) {
          logger.debug({ created, total: sureTxns.length }, 'Creation progress')
        }
      } catch (error) {
        errors++
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            transaction: sureTxn.name,
            date: sureTxn.date,
          },
          'Failed to create transaction'
        )
      }
    }

    logger.info(
      { created, skipped, errors },
      `Created: ${created}, Skipped: ${skipped} (duplicate), Errors: ${errors}`
    )

    results.push({
      redbarkAccountId: mapping.redbarkAccountId,
      sureAccountId: mapping.sureAccountId,
      accountName: redbarkAccount.name,
      fetched: redbarkTxns.length,
      created,
      skipped,
      errors,
    })
  }

  return results
}
