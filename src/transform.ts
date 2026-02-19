import type { RedbarkTransaction, SureTransactionCreate } from './types.js'
import { buildDedupKey } from './dedup.js'

/**
 * Transform a Redbark transaction into Sure's create format.
 *
 * Amount convention:
 *   Redbark: amount is a signed string (negative = outflow, or direction = 'debit')
 *   Sure: amount is always positive, `nature` field controls the sign
 */
export function toSureTransaction(
  txn: RedbarkTransaction,
  sureAccountId: string,
  options?: {
    categoryMapping?: Map<string, string>
    tagIds?: string[]
    currency?: string
  }
): SureTransactionCreate {
  const absAmount = Math.abs(parseFloat(txn.amount))
  const nature: 'income' | 'expense' = txn.direction === 'credit' ? 'income' : 'expense'

  // Build notes: always start with the dedup tag
  const notesParts: string[] = [buildDedupKey(txn.id)]

  // Add category to notes if not mapped to a Sure category
  if (txn.category && !options?.categoryMapping?.has(txn.category)) {
    notesParts.push(`Category: ${txn.category}`)
  }
  if (txn.merchantCategoryCode) {
    notesParts.push(`MCC: ${txn.merchantCategoryCode}`)
  }

  return {
    account_id: sureAccountId,
    date: txn.date,
    amount: absAmount,
    name: txn.merchantName || txn.description,
    nature,
    currency: options?.currency,
    notes: notesParts.join(' | '),
    category_id: txn.category ? options?.categoryMapping?.get(txn.category) : undefined,
    tag_ids: options?.tagIds,
  }
}

/**
 * Transform a batch of Redbark transactions, filtering to posted only.
 */
export function transformTransactions(
  transactions: RedbarkTransaction[],
  sureAccountId: string,
  options?: {
    categoryMapping?: Map<string, string>
    tagIds?: string[]
    currency?: string
  }
): SureTransactionCreate[] {
  return transactions
    .filter((txn) => txn.status === 'posted')
    .map((txn) => toSureTransaction(txn, sureAccountId, options))
}
