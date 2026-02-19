import { logger } from './logger.js'
import type {
  SureAccount,
  SureCategory,
  SureTag,
  SureTransaction,
  SureTransactionCreate,
} from './types.js'

const VERSION = '0.1.0'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

export class SureClient {
  private baseUrl: string
  private apiKey: string

  constructor(config: { url: string; apiKey: string }) {
    this.baseUrl = `${config.url.replace(/\/$/, '')}/api/v1`
    this.apiKey = config.apiKey
  }

  /** List all accounts (paginated, fetches all pages). */
  async listAccounts(): Promise<SureAccount[]> {
    return this.fetchAllPages<SureAccount>('/accounts')
  }

  /** List transactions with filters. */
  async listTransactions(params: {
    accountId: string
    startDate: string
    endDate: string
  }): Promise<SureTransaction[]> {
    return this.fetchAllPages<SureTransaction>('/transactions', {
      account_id: params.accountId,
      start_date: params.startDate,
      end_date: params.endDate,
    })
  }

  /** Create a single transaction. */
  async createTransaction(txn: SureTransactionCreate): Promise<SureTransaction> {
    return this.post<SureTransaction>('/transactions', { transaction: txn })
  }

  /** List categories (for optional mapping). */
  async listCategories(): Promise<SureCategory[]> {
    return this.fetchAllPages<SureCategory>('/categories')
  }

  /** List tags. */
  async listTags(): Promise<SureTag[]> {
    return this.fetchAllPages<SureTag>('/tags')
  }

  // ── Internal ─────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': `redbark-sure-sync/${VERSION}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : 60_000

          if (attempt >= MAX_RETRIES) {
            throw new SureRateLimitError(retryAfter ? parseInt(retryAfter, 10) : 60)
          }

          logger.warn(
            { attempt, waitMs },
            'Rate limited by Sure API, retrying'
          )
          await sleep(waitMs)
          continue
        }

        if (response.status === 401) {
          throw new SureApiError(
            401,
            'Sure API returned 401 Unauthorized.\n  → Your Sure API key may be invalid. Check Settings > Security > API Keys.',
          )
        }

        if (response.status === 403) {
          throw new SureApiError(
            403,
            "Sure API returned 403 Forbidden.\n  → Your API key may only have 'read' scope. It needs 'read_write' to create transactions.",
          )
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as Record<string, unknown>
          throw new SureApiError(
            response.status,
            (error.error as string) || `Sure API returned ${response.status}`,
            error.message as string | undefined,
          )
        }

        return (await response.json()) as T
      } catch (error) {
        if (error instanceof SureApiError || error instanceof SureRateLimitError) throw error

        if (attempt < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt - 1)
          logger.warn(
            { attempt, delay, error: String(error) },
            'Sure API request failed, retrying'
          )
          await sleep(delay)
          continue
        }

        throw new SureApiError(
          0,
          `Failed to reach Sure API after ${MAX_RETRIES} attempts: ${error}`,
        )
      }
    }

    throw new SureApiError(0, `Failed to reach Sure API after ${MAX_RETRIES} attempts`)
  }

  private async fetchAllPages<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const results: T[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const queryParams = new URLSearchParams({
        ...params,
        page: String(page),
        per_page: String(perPage),
      })
      const data = await this.request<T[]>('GET', `${path}?${queryParams}`)
      results.push(...data)

      if (data.length < perPage) break
      page++
    }

    return results
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }
}

export class SureApiError extends Error {
  status: number
  detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'SureApiError'
    this.status = status
    this.detail = detail
  }
}

export class SureRateLimitError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(
      `Sure API returned 429 Too Many Requests.\n` +
        `  → Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.\n` +
        `  → If running self-hosted Sure, rate limiting should be disabled by default.`
    )
    this.name = 'SureRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
