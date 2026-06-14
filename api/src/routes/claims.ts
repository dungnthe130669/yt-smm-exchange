import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'

const MAX_TASKS_PER_ACCOUNT_DAY = 8
const MAX_TASKS_PER_IP_DAY = 3
const MAX_CONCURRENT_CLAIMS = 3
const DELAY_MIN_SEC = 20 * 60  // 20 min
const DELAY_MAX_SEC = 45 * 60  // 45 min

export const claimRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// POST /api/claims/:taskId/claim — earner claims a task
claimRoutes.post('/:taskId/claim', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const ipHash = c.get('ipHash')
  const taskId = c.req.param('taskId')
  const today = new Date().toISOString().slice(0, 10)

  // Load task
  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ? AND status = 'OPEN'`)
    .bind(taskId).first<{ channel_id: string; buyer_id: string; delivered_count: number; target_count: number; max_providers: number }>()
  if (!task) return c.json({ error: 'TASK_NOT_FOUND', message: 'Task không tồn tại hoặc đã đóng' }, 404)

  // Cannot claim own task
  if (task.buyer_id === userId) {
    return c.json({ error: 'OWN_TASK', message: 'Không thể nhận task của chính mình' }, 400)
  }

  // ─── Fraud checks ─────────────────────────────────────────────────────────

  // 1. IP never subbed this channel
  const ipChannelDup = await c.env.DB.prepare(
    `SELECT 1 FROM ip_task_log WHERE ip_hash = ? AND channel_id = ?`
  ).bind(ipHash, task.channel_id).first()
  if (ipChannelDup) {
    return c.json({ error: 'IP_CHANNEL_DUPLICATE', message: 'IP này đã sub channel này trước đây' }, 429)
  }

  // 2. IP daily limit (KV — fast)
  const ipDailyKey = `ip:${ipHash}:${today}`
  const ipDailyCount = parseInt((await c.env.RATE_KV.get(ipDailyKey)) ?? '0')
  if (ipDailyCount >= MAX_TASKS_PER_IP_DAY) {
    return c.json({ error: 'IP_DAILY_LIMIT', message: 'IP đã đạt giới hạn task trong ngày' }, 429)
  }

  // 3. Account daily limit
  const todayStart = Math.floor(new Date(today).getTime() / 1000)
  const accountDaily = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims
     WHERE claimer_id = ? AND claimed_at >= ? AND status NOT IN ('REJECTED','EXPIRED')`
  ).bind(userId, todayStart).first<{ cnt: number }>()
  if ((accountDaily?.cnt ?? 0) >= MAX_TASKS_PER_ACCOUNT_DAY) {
    return c.json({ error: 'ACCOUNT_DAILY_LIMIT', message: 'Đã đạt giới hạn task trong ngày' }, 429)
  }

  // 4. Max concurrent active claims
  const activeClaims = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims
     WHERE claimer_id = ? AND status = 'CLAIMED'`
  ).bind(userId).first<{ cnt: number }>()
  if ((activeClaims?.cnt ?? 0) >= MAX_CONCURRENT_CLAIMS) {
    return c.json({ error: 'TOO_MANY_ACTIVE_CLAIMS', message: 'Hoàn thành claim hiện tại trước khi nhận thêm' }, 429)
  }

  // 5. User already claimed this task
  const existingClaim = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND claimer_id = ?`
  ).bind(taskId, userId).first()
  if (existingClaim) {
    return c.json({ error: 'ALREADY_CLAIMED', message: 'Bạn đã nhận task này rồi' }, 400)
  }

  // 6. Task not overfilled
  const activeFills = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims WHERE task_id = ? AND status NOT IN ('REJECTED','EXPIRED')`
  ).bind(taskId).first<{ cnt: number }>()
  if ((activeFills?.cnt ?? 0) >= task.max_providers) {
    return c.json({ error: 'TASK_FULL', message: 'Task đã đủ người nhận' }, 400)
  }

  // ─── Create claim ──────────────────────────────────────────────────────────

  const claimId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const delay = Math.floor(Math.random() * (DELAY_MAX_SEC - DELAY_MIN_SEC) + DELAY_MIN_SEC)
  const mustSubmitAfter = now + delay

  await c.env.DB.prepare(`
    INSERT INTO task_claims (id, task_id, claimer_id, claimer_ip_hash, claimed_at, must_submit_after)
    VALUES (?,?,?,?,?,?)
  `).bind(claimId, taskId, userId, ipHash, now, mustSubmitAfter).run()

  // Increment IP daily KV counter
  await c.env.RATE_KV.put(ipDailyKey, String(ipDailyCount + 1), { expirationTtl: 86400 })

  return c.json({
    claim_id: claimId,
    must_submit_after: mustSubmitAfter,  // unix timestamp
    wait_seconds: delay,
    channel_url: '', // caller loads from task
  }, 201)
})

// POST /api/claims/:claimId/submit — earner submits after subbing
// Triggers YouTube OAuth verify flow
claimRoutes.post('/:claimId/submit', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')
  const now = Math.floor(Date.now() / 1000)

  const claim = await c.env.DB.prepare(`
    SELECT tc.*, t.channel_id, t.channel_url, t.xu_per_unit, t.task_type
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ?
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string; claimer_ip_hash: string;
    must_submit_after: number; status: string; verify_attempts: number;
    channel_id: string; channel_url: string; xu_per_unit: number; task_type: string;
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim không tồn tại' }, 404)
  if (claim.status !== 'CLAIMED') return c.json({ error: 'CLAIM_ALREADY_SUBMITTED', message: 'Claim đã submit rồi' }, 400)

  // Enforce delay
  if (now < claim.must_submit_after) {
    const remaining = claim.must_submit_after - now
    return c.json({
      error: 'TOO_EARLY',
      message: `Cần chờ thêm ${Math.ceil(remaining / 60)} phút trước khi submit`,
      wait_seconds: remaining,
    }, 429)
  }

  // Mark as submitted — YouTube OAuth verify happens next
  // Client will redirect to /api/auth/youtube-verify?claim_id=X
  await c.env.DB.prepare(
    `UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`
  ).bind(now, claimId).run()

  return c.json({
    ok: true,
    verify_url: `/api/auth/youtube-verify?claim_id=${claimId}`,
    message: 'Đã submit. Tiếp tục verify YouTube OAuth.',
  })
})

// GET /api/claims/my — earner's own claims
claimRoutes.get('/my', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claims = await c.env.DB.prepare(`
    SELECT tc.*, t.channel_id, t.channel_url, t.channel_name, t.task_type, t.xu_per_unit
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.claimer_id = ?
    ORDER BY tc.claimed_at DESC
    LIMIT 50
  `).bind(userId).all()

  return c.json({ claims: claims.results })
})
