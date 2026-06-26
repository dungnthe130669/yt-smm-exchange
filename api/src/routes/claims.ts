import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'

const MAX_TASKS_PER_ACCOUNT_DAY = 8
const MAX_CONCURRENT_CLAIMS = 3

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
  if (!task) return c.json({ error: 'TASK_NOT_FOUND', message: 'Task not found or closed' }, 404)

  // Cannot claim own task
  if (task.buyer_id === userId) {
    return c.json({ error: 'OWN_TASK', message: 'Cannot claim your own task' }, 400)
  }

  // User must have linked YouTube channel
  const ytLinked = await c.env.DB.prepare(
    `SELECT 1 FROM user_linked_channels WHERE user_id = ? LIMIT 1`
  ).bind(userId).first()
  if (!ytLinked) {
    return c.json({ error: 'NO_YT_CHANNEL', message: 'You must link a YouTube channel before claiming tasks' }, 400)
  }

  // ─── Fraud checks ─────────────────────────────────────────────────────────

  // 1. IP never subbed this channel
  const ipChannelDup = await c.env.DB.prepare(
    `SELECT 1 FROM ip_task_log WHERE ip_hash = ? AND channel_id = ?`
  ).bind(ipHash, task.channel_id).first()
  if (ipChannelDup) {
    return c.json({ error: 'IP_CHANNEL_DUPLICATE', message: 'This IP has already subscribed to this channel' }, 429)
  }

  // 2. IP daily limit (KV — configurable via admin pricing, 0 = disabled)
  const ipDailyKey = `ip:${ipHash}:${today}`
  const ipDailyCount = parseInt((await c.env.RATE_KV.get(ipDailyKey)) ?? '0')
  const pricingRaw = await c.env.RATE_KV.get('pricing_config')
  const pricing = pricingRaw ? JSON.parse(pricingRaw) : {}
  const maxIpPerDay: number = pricing.max_tasks_per_ip_day ?? 0  // 0 = disabled
  if (maxIpPerDay > 0 && ipDailyCount >= maxIpPerDay) {
    return c.json({ error: 'IP_DAILY_LIMIT', message: 'IP daily task limit reached' }, 429)
  }

  // 3. Account daily limit
  const todayStart = Math.floor(new Date(today).getTime() / 1000)
  const accountDaily = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims
     WHERE claimer_id = ? AND claimed_at >= ? AND status NOT IN ('REJECTED','EXPIRED')`
  ).bind(userId, todayStart).first<{ cnt: number }>()
  if ((accountDaily?.cnt ?? 0) >= (pricing.max_tasks_per_account_day ?? MAX_TASKS_PER_ACCOUNT_DAY) ) {
    return c.json({ error: 'ACCOUNT_DAILY_LIMIT', message: 'Daily task limit reached' }, 429)
  }

  // 4. Max concurrent active claims — count CLAIMED only (SUBMITTED = already performing)
  const activeClaims = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims
     WHERE claimer_id = ? AND status = 'CLAIMED'`
  ).bind(userId).first<{ cnt: number }>()
  if ((activeClaims?.cnt ?? 0) >= MAX_CONCURRENT_CLAIMS) {
    return c.json({ error: 'TOO_MANY_ACTIVE_CLAIMS', message: 'You have 3 pending tasks — complete or wait for them to expire before claiming more' }, 429)
  }

  // 5. User already claimed this task
  const existingClaim = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND claimer_id = ?`
  ).bind(taskId, userId).first()
  if (existingClaim) {
    return c.json({ error: 'ALREADY_CLAIMED', message: 'You have already claimed this task' }, 400)
  }

  // 6. Task not overfilled
  const activeFills = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM task_claims WHERE task_id = ? AND status NOT IN ('REJECTED','EXPIRED')`
  ).bind(taskId).first<{ cnt: number }>()
  if ((activeFills?.cnt ?? 0) >= task.max_providers) {
    return c.json({ error: 'TASK_FULL', message: 'Task is full' }, 400)
  }

  // ─── Create claim ──────────────────────────────────────────────────────────

  const claimId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const taskCooldown = pricing.task_cooldown_seconds ?? 30
  const claimDelay = pricing.cooldown_seconds ?? 0

  // Task-to-task cooldown: check last completed claim time
  if (taskCooldown > 0) {
    const lastClaim = await c.env.DB.prepare(`
      SELECT MAX(verified_at) as last_verified
      FROM task_claims
      WHERE claimer_id = ? AND status = 'VERIFIED' AND verified_at IS NOT NULL
    `).bind(userId).first<{ last_verified: number | null }>()

    const lastVerified = lastClaim?.last_verified ?? 0
    const secondsSinceLast = now - lastVerified
    if (lastVerified > 0 && secondsSinceLast < taskCooldown) {
      const waitSec = taskCooldown - secondsSinceLast
      return c.json({
        error: 'TASK_COOLDOWN',
        message: `Please wait ${waitSec} more second${waitSec !== 1 ? 's' : ''} before claiming another task`,
        wait_seconds: waitSec,
      }, 429)
    }
  }

  const mustSubmitAfter = now + claimDelay

  await c.env.DB.prepare(`
    INSERT INTO task_claims (id, task_id, claimer_id, claimer_ip_hash, claimed_at, must_submit_after)
    VALUES (?,?,?,?,?,?)
  `).bind(claimId, taskId, userId, ipHash, now, mustSubmitAfter).run()

  // Increment IP daily KV counter
  await c.env.RATE_KV.put(ipDailyKey, String(ipDailyCount + 1), { expirationTtl: 86400 })

  return c.json({
    claim_id: claimId,
    must_submit_after: mustSubmitAfter,  // unix timestamp
    wait_seconds: claimDelay,
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
    SELECT tc.*, t.channel_id, t.channel_url, t.coin_per_unit, t.task_type
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ?
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string; claimer_ip_hash: string;
    must_submit_after: number; status: string; verify_attempts: number;
    channel_id: string; channel_url: string; coin_per_unit: number; task_type: string;
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found' }, 404)
  if (claim.status !== 'CLAIMED') return c.json({ error: 'CLAIM_ALREADY_SUBMITTED', message: 'Claim already submitted' }, 400)

  // Mark as submitted — YouTube OAuth verify happens next
  // Client will redirect to /api/auth/youtube-verify?claim_id=X
  await c.env.DB.prepare(
    `UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`
  ).bind(now, claimId).run()

  return c.json({
    ok: true,
    verify_url: `/api/auth/youtube-verify?claim_id=${claimId}`,
    message: 'Submitted. Proceed to YouTube verification.',
  })
})

// GET /api/claims/my — earner's own claims
claimRoutes.get('/my', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claims = await c.env.DB.prepare(`
    SELECT tc.*, t.channel_id, t.channel_url, t.channel_name, t.coin_per_unit,
           t.action_type, t.video_id, t.video_title
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.claimer_id = ?
    ORDER BY tc.claimed_at DESC
    LIMIT 50
  `).bind(userId).all()

  return c.json({ claims: claims.results })
})

// DELETE /api/claims/:claimId — earner abandons a CLAIMED task (not yet performed)
claimRoutes.delete('/:claimId', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')

  const claim = await c.env.DB.prepare(
    `SELECT id, status FROM task_claims WHERE id = ? AND claimer_id = ?`
  ).bind(claimId, userId).first<{ id: string; status: string }>()

  if (!claim) return c.json({ error: 'NOT_FOUND', message: 'Claim not found' }, 404)
  if (!['CLAIMED', 'SUBMITTED'].includes(claim.status)) {
    return c.json({ error: 'ALREADY_RESOLVED', message: 'Claim already completed or expired' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE task_claims SET status = 'EXPIRED' WHERE id = ?`
  ).bind(claimId).run()

  return c.json({ ok: true })
})
