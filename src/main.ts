import { logger } from './logger.js'
import { loadConfig, ConfigError } from './config.js'
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
  listSureAccounts: boolean
  listSureCategories: boolean
  dryRun: boolean
  days?: number
  help: boolean
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    listRedbarkAccounts: false,
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
  --list-redbark-accounts   List Redbark accounts (to find IDs for mapping)
  --list-sure-accounts      List Sure accounts (to find IDs for mapping)
  --list-sure-categories    List Sure categories (to find IDs for category mapping)
  --dry-run                 Preview what would be created without writing
  --days <number>           Number of days to sync (default: 30)
  --help, -h                Show this help message

ENVIRONMENT VARIABLES:
  REDBARK_API_KEY             (required) Your Redbark API key
  SURE_URL                    (required) URL of your Sure instance
  SURE_API_KEY                (required) Sure API key (read_write scope)
  ACCOUNT_MAPPING             (required) Account mapping (redbark_id:sure_id,...)
  REDBARK_API_URL             API base URL (default: https://app.redbark.io)
  SYNC_DAYS                   Days to sync (default: 30)
  CATEGORY_MAPPING            Category mapping (category:sure_category_id,...)
  TAG_NAME                    Tag name to apply to synced transactions
  LOG_LEVEL                   debug, info, warn, error (default: info)
  DRY_RUN                     true/false (default: false)
  BATCH_SIZE                  Transactions per batch (default: 25)
  CURRENCY                    Override currency (e.g. AUD)

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

  # Find category IDs for mapping
  redbark-sure-sync --list-sure-categories

DOCKER:
  docker run --rm --env-file .env ghcr.io/redbark-co/sure-sync
`)
}

async function handleListRedbarkAccounts(): Promise<void> {
  const apiKey = process.env.REDBARK_API_KEY
  const apiUrl = process.env.REDBARK_API_URL || 'https://app.redbark.io'

  if (!apiKey) {
    console.error(
      'ERROR: REDBARK_API_KEY is not set.\n' +
        '  → Create an API key at https://app.redbark.io/settings/api-keys'
    )
    process.exit(EXIT_CONFIG_ERROR)
  }

  const client = new RedbarkClient(apiKey, apiUrl)
  const connections = await client.listConnections()

  console.log('\nRedbark Accounts:')
  for (const conn of connections) {
    console.log(`  Connection: ${conn.institutionName} (${conn.provider})`)
    for (const account of conn.accounts) {
      const mask = account.accountNumber ? `  ${account.accountNumber}` : ''
      console.log(
        `    ${account.id}  ${account.name} (${account.type})${mask}`
      )
    }
    console.log()
  }
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

  // Load and validate config
  const config = loadConfig(overrides)

  if (config.dryRun) {
    logger.info('[DRY RUN] Preview mode — no changes will be written')
  }

  // Run sync
  const results = await runSync(config)

  // Summary
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

  if (totalErrors > 0) {
    process.exit(EXIT_SYNC_ERRORS)
  }
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
