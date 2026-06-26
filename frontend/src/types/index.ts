// Shared frontend types — mirrors API response shapes

export type TaskType = 'PAY' | 'CROSS_SUB'
export type TaskStatus = 'OPEN' | 'FILLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
export type ClaimStatus = 'CLAIMED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED'
export type CoinStatus = 'NONE' | 'PENDING' | 'LOCKED' | 'CREDITED' | 'CLAWED_BACK'

export interface User {
  id: string
  email: string
  name: string
  image?: string
  role: 'user' | 'admin'
}

export interface Wallet {
  user_id: string
  balance_usd_micro: number
  coin_balance: number
  coin_pending: number
}

export interface Task {
  id: string
  buyer_id: string
  channel_id: string
  channel_url: string
  channel_name?: string
  channel_avatar?: string
  target_count: number
  delivered_count: number
  task_type: TaskType
  price_per_unit_usd_micro: number
  coin_per_unit: number
  status: TaskStatus
  deadline: number
  created_at: number
  action_type?: string
  video_id?: string
  video_title?: string
  video_thumbnail?: string
  comment_template?: string
  escrow_usd_micro?: number
  escrow_coin?: number
}

export interface TaskClaim {
  id: string
  task_id: string
  claimer_id: string
  must_submit_after: number
  submitted_at?: number
  verified_at?: number
  youtube_channel_id?: string
  coin_status: CoinStatus
  coin_amount: number
  status: ClaimStatus
  coin_locked_at?: number
  // joined from task
  channel_id?: string
  channel_url?: string
  channel_name?: string
  task_type?: TaskType
  coin_per_unit?: number
}

export interface WalletTxn {
  id: string
  user_id: string
  type: string
  amount: number
  currency: 'USD' | 'COIN'
  ref_id?: string
  note?: string
  created_at: number
}

export type TxnType = 'EARN' | 'SPEND' | 'BUY_COIN' | 'BUY_USD' | 'CLAW_BACK' | 'REFUND' | 'ESCROW_LOCK' | 'ESCROW_RELEASE'

export interface ApiError {
  error: string
  message: string
}
