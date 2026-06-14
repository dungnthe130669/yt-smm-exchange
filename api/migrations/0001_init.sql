-- YT SMM Exchange — D1 Migration 0001
-- Run: npm run migrate:local  (dev)
--      npm run migrate:remote (prod)

-- ─── Users & Wallets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'user', -- user | admin
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_vnd INTEGER NOT NULL DEFAULT 0,  -- VND escrow available
  xu_balance  INTEGER NOT NULL DEFAULT 0,  -- xu spendable
  xu_pending  INTEGER NOT NULL DEFAULT 0   -- xu locked, awaiting 48h verify
);

-- ─── Auth (Better Auth managed tables) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS ba_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE TABLE IF NOT EXISTS ba_accounts (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,   -- google
  provider_account_id  TEXT NOT NULL,
  access_token         TEXT,
  refresh_token        TEXT,
  expires_at           INTEGER,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS ba_verifications (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Tasks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  buyer_id         TEXT NOT NULL REFERENCES users(id),
  channel_id       TEXT NOT NULL,   -- YouTube channel ID (UC...)
  channel_url      TEXT NOT NULL,
  channel_name     TEXT,
  channel_avatar   TEXT,

  target_count     INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 1000),
  delivered_count  INTEGER NOT NULL DEFAULT 0,

  -- PAY task: price in VND per unit, xu_per_unit = 0
  -- CROSS_SUB task: price_per_unit_vnd = 0, xu_per_unit > 0
  task_type        TEXT NOT NULL CHECK(task_type IN ('PAY','CROSS_SUB')),
  price_per_unit_vnd INTEGER NOT NULL DEFAULT 0,
  xu_per_unit      INTEGER NOT NULL DEFAULT 0,

  -- escrow: locked from buyer wallet until delivered/refunded
  escrow_vnd       INTEGER NOT NULL DEFAULT 0,
  escrow_xu        INTEGER NOT NULL DEFAULT 0,

  max_providers    INTEGER NOT NULL DEFAULT 3,
  priority         INTEGER NOT NULL DEFAULT 1, -- 1=PAY, 2=CROSS_SUB

  status           TEXT NOT NULL DEFAULT 'OPEN'
                   CHECK(status IN ('OPEN','FILLING','COMPLETED','CANCELLED','EXPIRED')),
  deadline         INTEGER NOT NULL,  -- unixepoch
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_buyer ON tasks(buyer_id);

-- ─── Task Claims ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_claims (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL REFERENCES tasks(id),
  claimer_id          TEXT NOT NULL REFERENCES users(id),

  -- Fraud prevention
  claimer_ip_hash     TEXT NOT NULL,
  claimed_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  must_submit_after   INTEGER NOT NULL,  -- claimed_at + random(1200,2700) seconds

  submitted_at        INTEGER,
  verified_at         INTEGER,

  -- YouTube OAuth verify result (token NEVER stored — verify then discard)
  youtube_channel_id  TEXT,   -- UC... of earner's channel

  -- Xu reward state
  xu_status   TEXT NOT NULL DEFAULT 'NONE'
              CHECK(xu_status IN ('NONE','PENDING','LOCKED','CREDITED','CLAWED_BACK')),
  xu_amount   INTEGER NOT NULL DEFAULT 0,
  xu_locked_at INTEGER,       -- when xu moved to LOCKED (48h countdown starts)

  verify_attempts INTEGER NOT NULL DEFAULT 0,

  status  TEXT NOT NULL DEFAULT 'CLAIMED'
          CHECK(status IN ('CLAIMED','SUBMITTED','VERIFIED','REJECTED','EXPIRED')),

  -- One earner channel can only do each task once
  UNIQUE(task_id, youtube_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_claimer ON task_claims(claimer_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_task ON task_claims(task_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_xu_unlock ON task_claims(xu_status, xu_locked_at); -- cron query

-- ─── IP Rate Limiting (persistent, D1 backed) ────────────────────────────────

CREATE TABLE IF NOT EXISTS ip_task_log (
  ip_hash    TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  date_str   TEXT NOT NULL,  -- YYYY-MM-DD
  PRIMARY KEY(ip_hash, channel_id)  -- one IP never subs same channel twice (ever)
);

CREATE INDEX IF NOT EXISTS idx_ip_daily ON ip_task_log(ip_hash, date_str); -- daily count

-- ─── Feed Filter ─────────────────────────────────────────────────────────────

-- Channels user has completed (never shown in feed again)
CREATE TABLE IF NOT EXISTS user_completed_channels (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  PRIMARY KEY(user_id, channel_id)
);

-- ─── Wallet Transactions (audit log) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_txns (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL CHECK(type IN ('EARN','SPEND','BUY_VND','BUY_XU','CLAW_BACK','REFUND','ESCROW_LOCK','ESCROW_RELEASE')),
  amount     INTEGER NOT NULL,  -- always positive
  currency   TEXT NOT NULL CHECK(currency IN ('VND','XU')),
  ref_id     TEXT,              -- task_id or claim_id
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_txns_user ON wallet_txns(user_id, created_at DESC);
