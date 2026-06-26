-- Migration 0008: rename xu_* → coin_*, vnd → usd_micro
-- SQLite does not support ALTER COLUMN RENAME — must recreate tables.
-- Tables affected: wallets, tasks, task_claims, wallet_txns

PRAGMA foreign_keys = OFF;

-- ─── 1. wallets ──────────────────────────────────────────────────────────────
-- xu_balance → coin_balance
-- xu_pending → coin_pending
-- balance_vnd → balance_usd_micro

CREATE TABLE wallets_new (
  user_id          TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  coin_balance     INTEGER NOT NULL DEFAULT 0,
  coin_pending     INTEGER NOT NULL DEFAULT 0,
  balance_usd_micro INTEGER NOT NULL DEFAULT 0
);
INSERT INTO wallets_new (user_id, coin_balance, coin_pending, balance_usd_micro)
  SELECT user_id, xu_balance, xu_pending, balance_vnd FROM wallets;
DROP TABLE wallets;
ALTER TABLE wallets_new RENAME TO wallets;

-- ─── 2. tasks ────────────────────────────────────────────────────────────────
-- xu_per_unit → coin_per_unit
-- escrow_xu   → escrow_coin
-- escrow_vnd  → escrow_usd_micro
-- price_per_unit_vnd → price_per_unit_usd_micro

CREATE TABLE tasks_new (
  id                    TEXT PRIMARY KEY,
  buyer_id              TEXT NOT NULL REFERENCES "user"(id),
  channel_id            TEXT NOT NULL,
  channel_url           TEXT NOT NULL,
  channel_name          TEXT,
  channel_avatar        TEXT,
  target_count          INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 1000),
  delivered_count       INTEGER NOT NULL DEFAULT 0,
  task_type             TEXT NOT NULL CHECK(task_type IN ('PAY','CROSS_SUB')),
  price_per_unit_usd_micro INTEGER NOT NULL DEFAULT 0,
  coin_per_unit         INTEGER NOT NULL DEFAULT 0,
  escrow_usd_micro      INTEGER NOT NULL DEFAULT 0,
  escrow_coin           INTEGER NOT NULL DEFAULT 0,
  max_providers         INTEGER NOT NULL DEFAULT 3,
  priority              INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK(status IN ('OPEN','FILLING','COMPLETED','CANCELLED','EXPIRED')),
  deadline              INTEGER NOT NULL,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  action_type           TEXT NOT NULL DEFAULT 'SUBSCRIBE',
  video_id              TEXT,
  video_title           TEXT,
  video_thumbnail       TEXT,
  comment_template      TEXT
);
INSERT INTO tasks_new
  SELECT id, buyer_id, channel_id, channel_url, channel_name, channel_avatar,
         target_count, delivered_count, task_type,
         price_per_unit_vnd, xu_per_unit,
         escrow_vnd, escrow_xu,
         max_providers, priority, status, deadline, created_at,
         action_type, video_id, video_title, video_thumbnail, comment_template
  FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_buyer ON tasks(buyer_id);

-- ─── 3. task_claims ──────────────────────────────────────────────────────────
-- xu_status   → coin_status
-- xu_amount   → coin_amount
-- xu_locked_at → coin_locked_at

CREATE TABLE task_claims_new (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  claimer_id          TEXT NOT NULL REFERENCES "user"(id),
  claimer_ip_hash     TEXT,
  claimed_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  must_submit_after   INTEGER NOT NULL,
  submitted_at        INTEGER,
  verified_at         INTEGER,
  youtube_channel_id  TEXT,
  coin_status         TEXT NOT NULL DEFAULT 'NONE'
                      CHECK(coin_status IN ('NONE','PENDING','LOCKED','CREDITED','CLAWED_BACK')),
  coin_amount         INTEGER NOT NULL DEFAULT 0,
  coin_locked_at      INTEGER,
  verify_attempts     INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'CLAIMED'
                      CHECK(status IN ('CLAIMED','SUBMITTED','VERIFIED','REJECTED','EXPIRED')),
  UNIQUE(task_id, youtube_channel_id)
);
INSERT INTO task_claims_new
  SELECT id, task_id, claimer_id, claimer_ip_hash,
         claimed_at, must_submit_after, submitted_at, verified_at,
         youtube_channel_id,
         xu_status, xu_amount, xu_locked_at,
         verify_attempts, status
  FROM task_claims;
DROP TABLE task_claims;
ALTER TABLE task_claims_new RENAME TO task_claims;

CREATE INDEX IF NOT EXISTS idx_claims_claimer ON task_claims(claimer_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_task ON task_claims(task_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_coin_unlock ON task_claims(coin_status, coin_locked_at);

-- ─── 4. wallet_txns ──────────────────────────────────────────────────────────
-- currency: 'XU' → 'COIN', 'VND' → 'USD'
-- type: 'BUY_XU' → 'BUY_COIN', 'BUY_VND' → 'BUY_USD'

CREATE TABLE wallet_txns_new (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id),
  type       TEXT NOT NULL CHECK(type IN ('EARN','SPEND','BUY_USD','BUY_COIN','CLAW_BACK','REFUND','ESCROW_LOCK','ESCROW_RELEASE')),
  amount     INTEGER NOT NULL,
  currency   TEXT NOT NULL CHECK(currency IN ('USD','COIN')),
  ref_id     TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO wallet_txns_new (id, user_id, type, amount, currency, ref_id, note, created_at)
  SELECT id, user_id,
    CASE type
      WHEN 'BUY_XU' THEN 'BUY_COIN'
      WHEN 'BUY_VND' THEN 'BUY_USD'
      ELSE type
    END,
    amount,
    CASE currency
      WHEN 'XU' THEN 'COIN'
      WHEN 'VND' THEN 'USD'
      ELSE currency
    END,
    ref_id, note, created_at
  FROM wallet_txns;
DROP TABLE wallet_txns;
ALTER TABLE wallet_txns_new RENAME TO wallet_txns;

CREATE INDEX IF NOT EXISTS idx_txns_user ON wallet_txns(user_id, created_at DESC);

-- Recreate task_claim_results (FK to task_claims which was recreated)
CREATE TABLE IF NOT EXISTS task_claim_results_new (
  claim_id   TEXT PRIMARY KEY REFERENCES task_claims(id) ON DELETE CASCADE,
  comment_id TEXT,
  rating     TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO task_claim_results_new SELECT * FROM task_claim_results;
DROP TABLE task_claim_results;
ALTER TABLE task_claim_results_new RENAME TO task_claim_results;

PRAGMA foreign_keys = ON;
