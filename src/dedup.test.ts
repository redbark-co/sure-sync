import { describe, it, expect } from 'vitest'
import {
  transactionFingerprint,
  buildDedupKey,
  extractDedupKeys,
  buildFingerprintSet,
  isDuplicate,
} from './dedup.js'
import type { RedbarkTransaction, SureTransaction } from './types.js'

describe('transactionFingerprint', () => {
  it('generates a fingerprint from date, amount, and name', () => {
    const fp = transactionFingerprint({
      date: '2024-08-20',
      amount: 45.99,
      name: 'Woolworths',
    })
    expect(fp).toBe('2024-08-20|45.99|woolworths')
  })

  it('normalizes name to lowercase', () => {
    const fp = transactionFingerprint({
      date: '2024-08-20',
      amount: 10,
      name: 'COLES EXPRESS',
    })
    expect(fp).toContain('coles express')
  })

  it('collapses whitespace in name', () => {
    const fp = transactionFingerprint({
      date: '2024-08-20',
      amount: 10,
      name: '  Coles   Express  ',
    })
    expect(fp).toBe('2024-08-20|10|coles express')
  })
})

describe('buildDedupKey', () => {
  it('builds a bracketed key', () => {
    expect(buildDedupKey('txn_abc123')).toBe('[redbark:txn_abc123]')
  })
})

describe('extractDedupKeys', () => {
  const makeSureTxn = (notes: string | null): SureTransaction => ({
    id: 'sure-1',
    date: '2024-08-20',
    amount: '$45.99',
    amount_cents: 4599,
    signed_amount_cents: 4599,
    currency: 'AUD',
    name: 'Test',
    classification: 'expense',
    account: { id: 'acc-1', name: 'Everyday', account_type: 'depository' },
    category: null,
    merchant: null,
    tags: [],
    notes,
    created_at: '2024-08-20T00:00:00Z',
    updated_at: '2024-08-20T00:00:00Z',
  })

  it('extracts redbark IDs from notes', () => {
    const txns = [
      makeSureTxn('[redbark:txn_abc123] | Category: groceries'),
      makeSureTxn('[redbark:txn_def456]'),
    ]
    const keys = extractDedupKeys(txns)
    expect(keys.size).toBe(2)
    expect(keys.has('txn_abc123')).toBe(true)
    expect(keys.has('txn_def456')).toBe(true)
  })

  it('ignores transactions without redbark tags', () => {
    const txns = [
      makeSureTxn('Just a regular note'),
      makeSureTxn(null),
    ]
    const keys = extractDedupKeys(txns)
    expect(keys.size).toBe(0)
  })

  it('handles empty array', () => {
    const keys = extractDedupKeys([])
    expect(keys.size).toBe(0)
  })
})

describe('buildFingerprintSet', () => {
  it('builds fingerprints from Sure transactions', () => {
    const txns: SureTransaction[] = [
      {
        id: 'sure-1',
        date: '2024-08-20',
        amount: '$45.99',
        amount_cents: 4599,
        signed_amount_cents: 4599,
        currency: 'AUD',
        name: 'Woolworths',
        classification: 'expense',
        account: { id: 'acc-1', name: 'Everyday', account_type: 'depository' },
        category: null,
        merchant: null,
        tags: [],
        notes: null,
        created_at: '2024-08-20T00:00:00Z',
        updated_at: '2024-08-20T00:00:00Z',
      },
    ]
    const fingerprints = buildFingerprintSet(txns)
    expect(fingerprints.size).toBe(1)
    expect(fingerprints.has('2024-08-20|45.99|woolworths')).toBe(true)
  })
})

describe('isDuplicate', () => {
  const baseTxn: RedbarkTransaction = {
    id: 'txn-123',
    accountId: 'acc-456',
    accountName: 'Smart Access',
    status: 'posted',
    date: '2024-08-20',
    description: 'WOOLWORTHS 1234 SYDNEY',
    amount: '-45.99',
    direction: 'debit',
    merchantName: 'Woolworths',
  }

  it('detects duplicate via exact ID match', () => {
    const existingKeys = new Set(['txn-123'])
    const existingFingerprints = new Set<string>()

    expect(isDuplicate(baseTxn, existingKeys, existingFingerprints)).toBe(true)
  })

  it('detects duplicate via fingerprint match', () => {
    const existingKeys = new Set<string>()
    const existingFingerprints = new Set(['2024-08-20|45.99|woolworths'])

    expect(isDuplicate(baseTxn, existingKeys, existingFingerprints)).toBe(true)
  })

  it('returns false when no match', () => {
    const existingKeys = new Set<string>()
    const existingFingerprints = new Set<string>()

    expect(isDuplicate(baseTxn, existingKeys, existingFingerprints)).toBe(false)
  })

  it('prefers ID match over fingerprint', () => {
    const existingKeys = new Set(['txn-123'])
    const existingFingerprints = new Set(['2024-08-20|45.99|woolworths'])

    expect(isDuplicate(baseTxn, existingKeys, existingFingerprints)).toBe(true)
  })

  it('uses description when merchantName is missing', () => {
    const txn = { ...baseTxn, merchantName: undefined }
    const existingKeys = new Set<string>()
    const existingFingerprints = new Set([
      '2024-08-20|45.99|woolworths 1234 sydney',
    ])

    expect(isDuplicate(txn, existingKeys, existingFingerprints)).toBe(true)
  })
})
