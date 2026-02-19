import { describe, it, expect } from 'vitest'
import { toSureTransaction, transformTransactions } from './transform.js'
import type { RedbarkTransaction } from './types.js'

describe('toSureTransaction', () => {
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
    category: 'groceries',
    merchantCategoryCode: '5411',
  }

  const sureAccountId = 'd5e6f7g8-1234-5678-abcd-ef1234567890'

  it('converts to absolute amount', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.amount).toBe(45.99)
  })

  it('sets nature to expense for debit', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.nature).toBe('expense')
  })

  it('sets nature to income for credit', () => {
    const result = toSureTransaction(
      { ...baseTxn, direction: 'credit', amount: '100.00' },
      sureAccountId
    )
    expect(result.nature).toBe('income')
    expect(result.amount).toBe(100)
  })

  it('includes [redbark:<id>] dedup tag in notes', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.notes).toContain('[redbark:txn-123]')
  })

  it('includes category in notes when not mapped', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.notes).toContain('Category: groceries')
  })

  it('excludes category from notes when mapped', () => {
    const categoryMapping = new Map([['groceries', 'cat-uuid-1']])
    const result = toSureTransaction(baseTxn, sureAccountId, { categoryMapping })
    expect(result.notes).not.toContain('Category: groceries')
    expect(result.category_id).toBe('cat-uuid-1')
  })

  it('includes MCC in notes', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.notes).toContain('MCC: 5411')
  })

  it('uses merchantName as name when available', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.name).toBe('Woolworths')
  })

  it('falls back to description when merchantName is missing', () => {
    const result = toSureTransaction(
      { ...baseTxn, merchantName: undefined },
      sureAccountId
    )
    expect(result.name).toBe('WOOLWORTHS 1234 SYDNEY')
  })

  it('sets the correct account_id', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.account_id).toBe(sureAccountId)
  })

  it('passes through currency override', () => {
    const result = toSureTransaction(baseTxn, sureAccountId, { currency: 'NZD' })
    expect(result.currency).toBe('NZD')
  })

  it('passes through tag IDs', () => {
    const result = toSureTransaction(baseTxn, sureAccountId, { tagIds: ['tag-1'] })
    expect(result.tag_ids).toEqual(['tag-1'])
  })

  it('formats notes with pipe separator', () => {
    const result = toSureTransaction(baseTxn, sureAccountId)
    expect(result.notes).toBe('[redbark:txn-123] | Category: groceries | MCC: 5411')
  })

  it('handles transaction with no category or MCC', () => {
    const result = toSureTransaction(
      { ...baseTxn, category: undefined, merchantCategoryCode: undefined },
      sureAccountId
    )
    expect(result.notes).toBe('[redbark:txn-123]')
  })
})

describe('transformTransactions', () => {
  const sureAccountId = 'd5e6f7g8-1234-5678-abcd-ef1234567890'

  it('filters out pending transactions', () => {
    const transactions: RedbarkTransaction[] = [
      {
        id: 'txn-1',
        accountId: 'acc-1',
        accountName: 'Account',
        status: 'posted',
        date: '2024-08-20',
        description: 'Posted txn',
        amount: '-10.00',
        direction: 'debit',
      },
      {
        id: 'txn-2',
        accountId: 'acc-1',
        accountName: 'Account',
        status: 'pending',
        date: '2024-08-21',
        description: 'Pending txn',
        amount: '-20.00',
        direction: 'debit',
      },
    ]

    const result = transformTransactions(transactions, sureAccountId)
    expect(result).toHaveLength(1)
    expect(result[0]!.notes).toContain('[redbark:txn-1]')
  })

  it('returns empty array when all transactions are pending', () => {
    const transactions: RedbarkTransaction[] = [
      {
        id: 'txn-1',
        accountId: 'acc-1',
        accountName: 'Account',
        status: 'pending',
        date: '2024-08-20',
        description: 'Pending',
        amount: '-10.00',
        direction: 'debit',
      },
    ]

    const result = transformTransactions(transactions, sureAccountId)
    expect(result).toHaveLength(0)
  })
})
