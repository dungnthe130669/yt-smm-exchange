// Coin economy logic — single source of truth for all coin operations
// All mutations go through these functions, never raw SQL in routes

import type { Env } from '../bindings'

// Credit coins to earner after verify (moves to PENDING, not LOCKED yet)
// Called immediately after OAuth verify passes
export async function creditXuPending(
  db: D1Database,
  claimId: string,
  claimerId: string,
  xuAmount: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare(`
      UPDATE task_claims
      SET xu_status = 'LOCKED', xu_amount = ?, xu_locked_at = ?
      WHERE id = ?
    `).bind(xuAmount, now, claimId),
    db.prepare(`
      UPDATE wallets SET xu_pending = xu_pending + ? WHERE user_id = ?
    `).bind(xuAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'EARN',
      xuAmount, 'XU', claimId,
      'Coins pending — waiting 48h unlock'
    ),
  ])
}

// Unlock coins after 48h churn check passes (LOCKED → CREDITED)
export async function unlockXu(
  db: D1Database,
  claimId: string,
  claimerId: string,
  xuAmount: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare(`
      UPDATE task_claims SET xu_status = 'CREDITED', verified_at = ? WHERE id = ?
    `).bind(now, claimId),
    db.prepare(`
      UPDATE wallets
      SET xu_pending = xu_pending - ?, xu_balance = xu_balance + ?
      WHERE user_id = ?
    `).bind(xuAmount, xuAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'EARN',
      xuAmount, 'XU', claimId,
      'Coins unlocked after 48h verify success'
    ),
  ])
}

// Claw back coins when churn detected (LOCKED → CLAWED_BACK)
export async function clawBackXu(
  db: D1Database,
  claimId: string,
  claimerId: string,
  xuAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE task_claims SET xu_status = 'CLAWED_BACK' WHERE id = ?
    `).bind(claimId),
    db.prepare(`
      UPDATE wallets SET xu_pending = xu_pending - ? WHERE user_id = ?
    `).bind(xuAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'CLAW_BACK',
      xuAmount, 'XU', claimId,
      'Unsub detected after 48h — coins clawed back'
    ),
  ])
}

// Spend coins for CROSS_SUB order (escrow lock from buyer)
export async function escrowXu(
  db: D1Database,
  userId: string,
  taskId: string,
  xuAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE wallets SET xu_balance = xu_balance - ? WHERE user_id = ?
    `).bind(xuAmount, userId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), userId, 'ESCROW_LOCK',
      xuAmount, 'XU', taskId,
      'Coins escrow lock for cross-sub task'
    ),
  ])
}

// Release escrow back to buyer (cancel/refund)
export async function releaseEscrowXu(
  db: D1Database,
  userId: string,
  taskId: string,
  xuAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE wallets SET xu_balance = xu_balance + ? WHERE user_id = ?
    `).bind(xuAmount, userId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), userId, 'ESCROW_RELEASE',
      xuAmount, 'XU', taskId,
      'Coins escrow returned — task cancelled'
    ),
  ])
}

// Current coin rate (platform configurable — stored in KV)
export async function getXuRate(kv: KVNamespace): Promise<{ earnPerSub: number; costPerSub: number }> {
  const raw = await kv.get('xu:rate')
  if (raw) {
    try {
      return JSON.parse(raw) as { earnPerSub: number; costPerSub: number }
    } catch { /* fall through */ }
  }
  // Default rate: earn 10 coins/sub, spend 14 coins/sub (platform keeps 4 coin spread)
  return { earnPerSub: 10, costPerSub: 14 }
}
