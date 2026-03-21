import { logger } from './logger.js'
import { loadConfig, ConfigError, type Config } from './config.js'
import { RedbarkClient } from './redbark-client.js'
import { SureClient } from './sure-client.js'
import { runSync } from './sync.js'

// Exit codes
const EXIT_SUCCESS = 0
const EXIT_SYNC_ERRORS = 1
const EXIT_CONFIG_ERROR = 2
const EXIT_CONNECTION_ERROR = 3

interface CliFlags {
  listRedbarkAccounts: boolean
  listRedbarkCategories: boolean
  listSureAccounts: boolean
  listSureCategories: boolean
  dryRun: boolean
  days?: number
  interval?: number
  help: boolean
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    listRedbarkAccounts: false,
    listRedbarkCategories: false,
    listSureAccounts: false,
    listSureCategories: false,
    dryRun: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--list-redbark-accounts':
        flags.listRedbarkAccounts = true
        break
      case '--list-redbark-categories':
        flags.listRedbarkCategories = true
        break
      case '--list-sure-accounts':
        flags.listSureAccounts = true
        break
      case '--list-sure-categories':
        flags.listSureCategories = true
        break
      case '--dry-run':
        flags.dryRun = true
        break
      case '--days': {
        const val = argv[++i]
        if (!val || isNaN(parseInt(val, 10))) {
          console.error('ERROR: --days requires a number')
          process.exit(EXIT_CONFIG_ERROR)
        }
        flags.days = parseInt(val, 10)
        break
      }
      case '--interval': {
        const val = argv[++i]
        if (!val || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
          console.error('ERROR: --interval requires a positive number (hours)')
          process.exit(EXIT_CONFIG_ERROR)
        }
        flags.interval = parseFloat(val)
        break
      }
      case '--help':
      case '-h':
        flags.help = true
        break
      default:
        if (arg?.startsWith('--')) {
          console.error(`Unknown flag: ${arg}`)
          process.exit(EXIT_CONFIG_ERROR)
        }
    }
  }

  return flags
}

function printHelp(): void {
  console.log(`
redbark-sure-sync - Sync bank transactions from Redbark to Sure

USAGE:
  redbark-sure-sync [OPTIONS]

OPTIONS:
  --list-redbark-accounts     List Redbark accounts (to find IDs for mapping)
  --list-redbark-categories   List Redbark transaction categories (for category mapping)
  --list-sure-accounts        List Sure accounts (to find IDs for mapping)
  --list-sure-categories      List Sure categories (to find IDs for category mapping)
  --dry-run                 Preview what would be created without writing
  --days <number>           Number of days to sync (default: 30)
  --interval <hours>        Keep running and re-sync every N hours (e.g. 6)
  --help, -h                Show this help message

ENVIRONMENT VARIABLES:
  REDBARK_API_KEY             (required) Your Redbark API key
  SURE_URL                    (required) URL of your Sure instance
  SURE_API_KEY                (required) Sure API key (read_write scope)
  ACCOUNT_MAPPING             (required) Account mapping (redbark_id:sure_id,...)
  REDBARK_API_URL             API base URL (default: https://api.redbark.co)
  SYNC_DAYS                   Days to sync (default: 30)
  CATEGORY_MAPPING            Category mapping (category:sure_category_id,...)
  TAG_NAME                    Tag name to apply to synced transactions
  LOG_LEVEL                   debug, info, warn, error (default: info)
  DRY_RUN                     true/false (default: false)
  BATCH_SIZE                  Transactions per batch (default: 25)
  CURRENCY                    Override currency (e.g. AUD)
  SYNC_INTERVAL               Keep running, sync every N hours (e.g. 6)

EXAMPLES:
  # Run sync
  redbark-sure-sync

  # Preview without creating
  redbark-sure-sync --dry-run

  # Sync last 60 days
  redbark-sure-sync --days 60

  # Find account IDs for mapping
  redbark-sure-sync --list-redbark-accounts
  redbark-sure-sync --list-sure-accounts

  # Find category names for mapping
  redbark-sure-sync --list-redbark-categories
  redbark-sure-sync --list-sure-categories

DOCKER:
  docker run --rm --env-file .env ghcr.io/redbark-co/sure-sync
`)
}

async function handleListRedbarkAccounts(): Promise<void> {
  const apiKey = process.env.REDBARK_API_KEY
  const apiUrl = process.env.REDBARK_API_URL || 'https://api.redbark.co'

  if (!apiKey) {
    console.error(
      'ERROR: REDBARK_API_KEY is not set.\n' +
        '  → Create an API key at https://app.redbark.co/settings/api'
    )
    process.exit(EXIT_CONFIG_ERROR)
  }

  const client = new RedbarkClient(apiKey, apiUrl)
  const [connections, accounts] = await Promise.all([
    client.listConnections(),
    client.listAccounts(),
  ])

  // Group accounts by connectionId
  const accountsByConnection = new Map<string, typeof accounts>()
  for (const account of accounts) {
    const group = accountsByConnection.get(account.connectionId) || []
    group.push(account)
    accountsByConnection.set(account.connectionId, group)
  }

  console.log('\nRedbark Accounts:')
  for (const conn of connections) {
    console.log(`  Connection: ${conn.institutionName} (${conn.provider})`)
    const connAccounts = accountsByConnection.get(conn.id) || []
    for (const account of connAccounts) {
      const mask = account.accountNumber ? `  ${account.accountNumber}` : ''
      console.log(
        `    ${account.id}  ${account.name} (${account.type})${mask}`
      )
    }
    console.log()
  }
}

async function handleListRedbarkCategories(): Promise<void> {
  const apiKey = process.env.REDBARK_API_KEY
  const apiUrl = process.env.REDBARK_API_URL || 'https://api.redbark.co'

  if (!apiKey) {
    console.error(
      'ERROR: REDBARK_API_KEY is not set.\n' +
        '  → Create an API key at https://app.redbark.co/settings/api'
    )
    process.exit(EXIT_CONFIG_ERROR)
  }

  const client = new RedbarkClient(apiKey, apiUrl)
  const categories = await client.listCategories()

  console.log('\nRedbark Transaction Categories:')
  console.log('  Use these names on the left side of CATEGORY_MAPPING.\n')
  for (const cat of categories) {
    console.log(`  ${cat.label}`)
  }
  console.log()
}

async function handleListSureAccounts(): Promise<void> {
  const sureUrl = process.env.SURE_URL
  const sureApiKey = process.env.SURE_API_KEY

  if (!sureUrl || !sureApiKey) {
    console.error(
      'ERROR: SURE_URL and SURE_API_KEY are required.\n' +
        '  → Set these environment variables to connect to your Sure instance.'
    )
    process.exit(EXIT_CONFIG_ERROR)
  }

  const client = new SureClient({ url: sureUrl, apiKey: sureApiKey })
  const accounts = await client.listAccounts()

  console.log('\nSure Accounts:')
  for (const account of accounts) {
    const currency = account.currency ? `  ${account.currency}` : ''
    console.log(
      `  ${account.id}  ${account.name}  (${account.account_type})${currency}`
    )
  }
  console.log()
}

async function handleListSureCategories(): Promise<void> {
  const sureUrl = process.env.SURE_URL
  const sureApiKey = process.env.SURE_API_KEY

  if (!sureUrl || !sureApiKey) {
    console.error(
      'ERROR: SURE_URL and SURE_API_KEY are required.\n' +
        '  → Set these environment variables to connect to your Sure instance.'
    )
    process.exit(EXIT_CONFIG_ERROR)
  }

  const client = new SureClient({ url: sureUrl, apiKey: sureApiKey })
  const categories = await client.listCategories()

  console.log('\nSure Categories:')
  for (const category of categories) {
    console.log(
      `  ${category.id}  ${category.name}  (${category.classification})`
    )
  }
  console.log()
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    printHelp()
    process.exit(EXIT_SUCCESS)
  }

  // Handle list commands (don't need full config)
  if (flags.listRedbarkAccounts) {
    await handleListRedbarkAccounts()
    process.exit(EXIT_SUCCESS)
  }

  if (flags.listRedbarkCategories) {
    await handleListRedbarkCategories()
    process.exit(EXIT_SUCCESS)
  }

  if (flags.listSureAccounts) {
    await handleListSureAccounts()
    process.exit(EXIT_SUCCESS)
  }

  if (flags.listSureCategories) {
    await handleListSureCategories()
    process.exit(EXIT_SUCCESS)
  }

  // Build config overrides from CLI flags
  const overrides: Record<string, string> = {}
  if (flags.dryRun) overrides.DRY_RUN = 'true'
  if (flags.days) overrides.SYNC_DAYS = String(flags.days)
  if (flags.interval) overrides.SYNC_INTERVAL = String(flags.interval)

  // Load and validate config
  const config = loadConfig(overrides)

  if (config.dryRun) {
    logger.info('[DRY RUN] Preview mode — no changes will be written')
  }

  const intervalMs = config.syncIntervalHours
    ? config.syncIntervalHours * 60 * 60 * 1000
    : undefined

  if (intervalMs) {
    logger.info(
      { intervalHours: config.syncIntervalHours },
      `Running in continuous mode, syncing every ${config.syncIntervalHours} hours`
    )
  }

  // Run sync (once or in a loop)
  while (true) {
    try {
      const hasErrors = await runOnce(config)

      if (!intervalMs) {
        if (hasErrors) process.exit(EXIT_SYNC_ERRORS)
        break
      }
    } catch (error) {
      if (!intervalMs) throw error
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Sync failed, will retry next interval'
      )
    }

    const nextRun = new Date(Date.now() + intervalMs)
    logger.info({ nextRun: nextRun.toISOString() }, `Next sync at ${nextRun.toISOString()}`)
    await sleep(intervalMs)
  }
}

async function runOnce(config: Config): Promise<boolean> {
  const results = await runSync(config)

  const totalCreated = results.reduce((sum, r) => sum + r.created, 0)
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)

  if (config.dryRun) {
    logger.info(
      `[DRY RUN] Would create ${totalCreated} transactions across ${results.length} accounts. No changes written.`
    )
  } else {
    logger.info(
      { totalCreated, totalSkipped, totalErrors, accounts: results.length },
      `Sync complete. ${totalCreated} transactions created in Sure.`
    )
  }

  return totalErrors > 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    console.error(`ERROR: ${error.message}`)
    process.exit(EXIT_CONFIG_ERROR)
  }

  if (
    error instanceof Error &&
    (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('Failed to reach'))
  ) {
    logger.error({ error: error.message }, 'Connection error')
    process.exit(EXIT_CONNECTION_ERROR)
  }

  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Unexpected error')
  process.exit(EXIT_SYNC_ERRORS)
})
