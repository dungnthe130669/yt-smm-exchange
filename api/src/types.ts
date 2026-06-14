// Shared domain types for YT SMM Exchange
// All DB types mirror the SQL schema exactly

export type TaskType = 'PAY' | 'CROSS_SUB'
export type TaskStatus = 'OPEN' | 'FILLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
export type ClaimStatus = 'CLAIMED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED'
export type XuStatus = 'NONE' | 'PENDING' | 'LOCKED' | 'CREDITED' | 'CLAWED_BACK'
export type TxnType = 'EARN' | 'SPEND' | 'BUY_VND' | 'BUY_XU' | 'CLAW_BACK' | 'REFUND' | 'ESCROW_LOCK' | 'ESCROW_RELEASE'
export type Currency = 'VND' | 'XU'

export interface User {
  id: string
  email: string
  name: string
  avatar: string | null
  role: 'user' | 'admin'
  created_at: number
}

export interface Wallet {
  user_id: string
  balance_vnd: number
  xu_balance: number
  xu_pending: number
}

export interface Task {
  id: string
  buyer_id: string
  channel_id: string
  channel_url: string
  channel_name: string | null
  channel_avatar: string | null
  target_count: number
  delivered_count: number
  task_type: TaskType
  price_per_unit_vnd: number
  xu_per_unit: number
  escrow_vnd: number
  escrow_xu: number
  max_providers: number
  priority: number
  status: TaskStatus
  deadline: number
  created_at: number
}

export interface TaskClaim {
  id: string
  task_id: string
  claimer_id: string
  claimer_ip_hash: string
  claimed_at: number
  must_submit_after: number
  submitted_at: number | null
  verified_at: number | null
  youtube_channel_id: string | null
  xu_status: XuStatus
  xu_amount: number
  xu_locked_at: number | null
  verify_attempts: number
  status: ClaimStatus
}

export interface WalletTxn {
  id: string
  user_id: string
  type: TxnType
  amount: number
  currency: Currency
  ref_id: string | null
  note: string | null
  created_at: number
}

// API response error format (standard across all routes)
export interface ApiError {
  error: string   // machine-readable code e.g. "TASK_NOT_FOUND"
  message: string // human-readable Vietnamese
}

// Context variables injected by middleware
export interface HonoVariables {
  user: User | null
  userId: string | null
  ipHash: string
}
