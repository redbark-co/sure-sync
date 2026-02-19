export interface RedbarkConnection {
  id: string
  provider: string
  institutionName: string
  institutionLogo?: string
  status: string
  accounts: RedbarkAccount[]
}

export interface RedbarkAccount {
  id: string
  connectionId: string
  provider: string
  name: string
  type: string
  institutionName: string
  accountNumber?: string
  balance?: string
  availableBalance?: string
  currency?: string
}

export interface RedbarkTransaction {
  id: string
  accountId: string
  accountName: string
  status: string
  date: string
  description: string
  amount: string
  direction: 'credit' | 'debit'
  category?: string
  merchantName?: string
  merchantCategoryCode?: string
}

export interface AccountMapping {
  redbarkAccountId: string
  sureAccountId: string
}

export interface SyncResult {
  redbarkAccountId: string
  sureAccountId: string
  accountName: string
  fetched: number
  created: number
  skipped: number
  errors: number
}

export interface PaginatedResponse<T> {
  data: T[]
  cursor: string | null
  hasMore: boolean
}

// Sure types

export interface SureAccount {
  id: string
  name: string
  account_type: string
  balance: string
  currency: string
}

export interface SureTransaction {
  id: string
  date: string
  amount: string
  amount_cents: number
  signed_amount_cents: number
  currency: string
  name: string
  classification: string
  account: { id: string; name: string; account_type: string }
  category: { id: string; name: string } | null
  merchant: { id: string; name: string } | null
  tags: { id: string; name: string }[]
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SureTransactionCreate {
  account_id: string
  date: string
  amount: number
  name: string
  nature: 'income' | 'expense'
  currency?: string
  notes?: string
  category_id?: string
  tag_ids?: string[]
}

export interface SureCategory {
  id: string
  name: string
  classification: string
}

export interface SureTag {
  id: string
  name: string
}
