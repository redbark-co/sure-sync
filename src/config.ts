import { z } from 'zod'
import type { AccountMapping } from './types.js'

const accountMappingSchema = z
  .string()
  .min(1)
  .transform((val): AccountMapping[] => {
    return val.split(',').map((pair) => {
      const [redbarkAccountId, sureAccountId] = pair.trim().split(':')
      if (!redbarkAccountId || !sureAccountId) {
        throw new Error(
          `Invalid account mapping "${pair}". Expected format: redbark_id:sure_id`
        )
      }
      return {
        redbarkAccountId: redbarkAccountId.trim(),
        sureAccountId: sureAccountId.trim(),
      }
    })
  })

const categoryMappingSchema = z
  .string()
  .optional()
  .transform((val): Map<string, string> | undefined => {
    if (!val) return undefined
    const map = new Map<string, string>()
    for (const pair of val.split(',')) {
      const [category, sureId] = pair.trim().split(':')
      if (!category || !sureId) {
        throw new Error(
          `Invalid category mapping "${pair}". Expected format: category:sure_category_id`
        )
      }
      map.set(category.trim(), sureId.trim())
    }
    return map
  })

const configSchema = z.object({
  redbarkApiKey: z.string().min(1, 'REDBARK_API_KEY is required'),
  redbarkApiUrl: z.string().url().default('https://app.redbark.io'),
  sureUrl: z.string().min(1, 'SURE_URL is required'),
  sureApiKey: z.string().min(1, 'SURE_API_KEY is required'),
  accountMapping: accountMappingSchema,
  syncDays: z.coerce.number().int().positive().default(30),
  categoryMapping: categoryMappingSchema,
  tagName: z.string().optional(),
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  dryRun: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  batchSize: z.coerce.number().int().positive().max(100).default(25),
  currency: z.string().length(3).optional(),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(overrides?: Partial<Record<string, string>>): Config {
  const env = { ...process.env, ...overrides }

  const result = configSchema.safeParse({
    redbarkApiKey: env.REDBARK_API_KEY,
    redbarkApiUrl: env.REDBARK_API_URL || 'https://app.redbark.io',
    sureUrl: env.SURE_URL,
    sureApiKey: env.SURE_API_KEY,
    accountMapping: env.ACCOUNT_MAPPING,
    syncDays: env.SYNC_DAYS || '30',
    categoryMapping: env.CATEGORY_MAPPING || undefined,
    tagName: env.TAG_NAME || undefined,
    logLevel: env.LOG_LEVEL || 'info',
    dryRun: env.DRY_RUN || 'false',
    batchSize: env.BATCH_SIZE || '25',
    currency: env.CURRENCY || undefined,
  })

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.')
        return `  ${field}: ${issue.message}`
      })
      .join('\n')

    throw new ConfigError(`Invalid configuration:\n${errors}`)
  }

  return result.data
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/**
 * Parse account mapping from CLI format: "redbark_id:sure_id,..."
 */
export function parseAccountMapping(input: string): AccountMapping[] {
  const result = accountMappingSchema.safeParse(input)
  if (!result.success) {
    throw new ConfigError(
      `Invalid account mapping: ${result.error.issues[0]?.message}`
    )
  }
  return result.data
}
