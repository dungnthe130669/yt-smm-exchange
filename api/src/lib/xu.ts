// Coin economy logic — single source of truth for all coin operations
// All mutations go through these functions, never raw SQL in routes

import type { Env } from '../bindings'

// Credit coins to earner after verify (moves to LOCKED, not CREDITED yet)
// Called immediately after OAuth verify passes
export async function creditCoinPending(
  db: D1Database,
  claimId: string,
  claimerId: string,
  coinAmount: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare(`
      UPDATE task_claims
      SET coin_status = 'LOCKED', coin_amount = ?, coin_locked_at = ?
      WHERE id = ?
    `).bind(coinAmount, now, claimId),
    db.prepare(`
      UPDATE wallets SET coin_pending = coin_pending + ? WHERE user_id = ?
    `).bind(coinAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'EARN',
      coinAmount, 'COIN', claimId,
      'Coins pending — waiting 48h unlock'
    ),
  ])
}

// Unlock coins after 48h churn check passes (LOCKED → CREDITED)
export async function unlockCoin(
  db: D1Database,
  claimId: string,
  claimerId: string,
  coinAmount: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare(`
      UPDATE task_claims SET coin_status = 'CREDITED', verified_at = ? WHERE id = ?
    `).bind(now, claimId),
    db.prepare(`
      UPDATE wallets
      SET coin_pending = coin_pending - ?, coin_balance = coin_balance + ?
      WHERE user_id = ?
    `).bind(coinAmount, coinAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'EARN',
      coinAmount, 'COIN', claimId,
      'Coins unlocked after 48h verify success'
    ),
  ])
}

// Claw back coins when churn detected (LOCKED → CLAWED_BACK)
export async function clawBackCoin(
  db: D1Database,
  claimId: string,
  claimerId: string,
  coinAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE task_claims SET coin_status = 'CLAWED_BACK' WHERE id = ?
    `).bind(claimId),
    db.prepare(`
      UPDATE wallets SET coin_pending = coin_pending - ? WHERE user_id = ?
    `).bind(coinAmount, claimerId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), claimerId, 'CLAW_BACK',
      coinAmount, 'COIN', claimId,
      'Unsub detected after 48h — coins clawed back'
    ),
  ])
}

// Spend coins for CROSS_SUB order (escrow lock from buyer)
export async function escrowCoin(
  db: D1Database,
  userId: string,
  taskId: string,
  coinAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE wallets SET coin_balance = coin_balance - ? WHERE user_id = ?
    `).bind(coinAmount, userId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), userId, 'ESCROW_LOCK',
      coinAmount, 'COIN', taskId,
      'Coins escrow lock for cross-sub task'
    ),
  ])
}

// Release escrow back to buyer (cancel/refund)
export async function releaseEscrowCoin(
  db: D1Database,
  userId: string,
  taskId: string,
  coinAmount: number
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE wallets SET coin_balance = coin_balance + ? WHERE user_id = ?
    `).bind(coinAmount, userId),
    db.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), userId, 'ESCROW_RELEASE',
      coinAmount, 'COIN', taskId,
      'Coins escrow returned — task cancelled'
    ),
  ])
}

// Current coin rate (platform configurable — stored in KV)
export async function getCoinRate(kv: KVNamespace): Promise<{ earnPerSub: number; costPerSub: number }> {
  const raw = await kv.get('xu:rate')
  if (raw) {
    try {
      return JSON.parse(raw) as { earnPerSub: number; costPerSub: number }
    } catch { /* fall through */ }
  }
  // Default rate: earn 10 coins/sub, spend 14 coins/sub (platform keeps 4 coin spread)
  return { earnPerSub: 10, costPerSub: 14 }
}
