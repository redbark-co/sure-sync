import type { RedbarkTransaction, SureTransaction } from './types.js'

/**
 * Generate a fingerprint for fuzzy dedup matching.
 * Combines date + absolute amount + normalized name.
 */
export function transactionFingerprint(txn: {
  date: string
  amount: number
  name: string
}): string {
  const normalizedName = txn.name.toLowerCase().trim().replace(/\s+/g, ' ')
  return `${txn.date}|${txn.amount}|${normalizedName}`
}

/**
 * Build the dedup key to embed in Sure transaction notes.
 * Format: [redbark:<redbark_transaction_id>]
 */
export function buildDedupKey(redbarkTxnId: string): string {
  return `[redbark:${redbarkTxnId}]`
}

/**
 * Extract Redbark transaction IDs from existing Sure transactions' notes.
 * Looks for [redbark:<id>] patterns.
 */
export function extractDedupKeys(sureTxns: SureTransaction[]): Set<string> {
  const keys = new Set<string>()
  for (const txn of sureTxns) {
    const match = txn.notes?.match(/\[redbark:([^\]]+)\]/)
    if (match) keys.add(match[1]!)
  }
  return keys
}

/**
 * Build a set of fingerprints from existing Sure transactions for fuzzy matching.
 */
export function buildFingerprintSet(sureTxns: SureTransaction[]): Set<string> {
  const fingerprints = new Set<string>()
  for (const txn of sureTxns) {
    const fp = transactionFingerprint({
      date: txn.date,
      amount: Math.abs(txn.amount_cents / 100),
      name: txn.name,
    })
    fingerprints.add(fp)
  }
  return fingerprints
}

/**
 * Check if a Redbark transaction already exists in Sure.
 * Uses dual-layer dedup:
 *   1. Exact ID match via [redbark:<id>] notes tag
 *   2. Fingerprint match (date + amount + name)
 */
export function isDuplicate(
  redbarkTxn: RedbarkTransaction,
  existingKeys: Set<string>,
  existingFingerprints: Set<string>,
): boolean {
  // Primary: exact ID match via notes tag
  if (existingKeys.has(redbarkTxn.id)) return true

  // Secondary: fingerprint match (catches manual imports, etc.)
  const fp = transactionFingerprint({
    date: redbarkTxn.date,
    amount: Math.abs(parseFloat(redbarkTxn.amount)),
    name: redbarkTxn.merchantName || redbarkTxn.description,
  })
  return existingFingerprints.has(fp)
}
