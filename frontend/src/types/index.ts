// Shared frontend types — mirrors API response shapes

export type TaskType = 'PAY' | 'CROSS_SUB'
export type TaskStatus = 'OPEN' | 'FILLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
export type ClaimStatus = 'CLAIMED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED'
export type XuStatus = 'NONE' | 'PENDING' | 'LOCKED' | 'CREDITED' | 'CLAWED_BACK'

export interface User {
  id: string
  email: string
  name: string
  image?: string
  role: 'user' | 'admin'
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
  channel_name?: string
  channel_avatar?: string
  target_count: number
  delivered_count: number
  task_type: TaskType
  price_per_unit_vnd: number
  xu_per_unit: number
  status: TaskStatus
  deadline: number
  created_at: number
  action_type?: string
  video_id?: string
  video_title?: string
  video_thumbnail?: string
  comment_template?: string
}

export interface TaskClaim {
  id: string
  task_id: string
  claimer_id: string
  must_submit_after: number
  submitted_at?: number
  verified_at?: number
  youtube_channel_id?: string
  xu_status: XuStatus
  xu_amount: number
  status: ClaimStatus
  // joined from task
  channel_id?: string
  channel_url?: string
  channel_name?: string
  task_type?: TaskType
  xu_per_unit?: number
}

export interface WalletTxn {
  id: string
  user_id: string
  type: string
  amount: number
  currency: 'VND' | 'XU'
  ref_id?: string
  note?: string
  created_at: number
}

export interface ApiError {
  error: string
  message: string
}
