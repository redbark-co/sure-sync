export interface RedbarkConnection {
  id: string
  provider: string
  category: string
  institutionId: string
  institutionName: string
  institutionLogo: string | null
  status: string
  lastRefreshedAt: string | null
  createdAt: string
}

export interface RedbarkAccount {
  id: string
  connectionId: string
  provider: string | null
  name: string
  type: string
  institutionName: string | null
  accountNumber: string | null
  currency: string
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

export interface PaginationInfo {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationInfo
}

// Sure types

export interface SurePagination {
  page: number
  per_page: number
  total_count: number
  total_pages: number
}

export interface SureAccount {
  id: string
  name: string
  balance: string
  currency: string
  classification: string
  account_type: string
}

export interface SureTransaction {
  id: string
  date: string
  amount: string
  amount_cents: number
  signed_amount_cents: number
  currency: string
  name: string
  notes: string | null
  classification: string
  account: { id: string; name: string; account_type: string }
  category: { id: string; name: string; color: string; icon: string } | null
  merchant: { id: string; name: string } | null
  tags: { id: string; name: string; color: string }[]
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
