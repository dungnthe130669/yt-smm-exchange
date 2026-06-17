-- Migration 0003: Fix FK references from `users` → `user` (Better Auth table)
-- SQLite can't ALTER FK constraints, must recreate tables.
-- Strategy: recreate wallets, tasks, task_claims, ip_task_log, user_completed_channels, wallet_txns
-- referencing `user(id)` instead of `users(id)`.
-- `users` table kept for now but orphaned — can drop later.

PRAGMA foreign_keys = OFF;

-- 1. wallets
CREATE TABLE wallets_new (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  balance_vnd INTEGER NOT NULL DEFAULT 0,
  xu_balance  INTEGER NOT NULL DEFAULT 0,
  xu_pending  INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO wallets_new SELECT * FROM wallets;
DROP TABLE wallets;
ALTER TABLE wallets_new RENAME TO wallets;

-- 2. tasks
CREATE TABLE tasks_new (
  id               TEXT PRIMARY KEY,
  buyer_id         TEXT NOT NULL REFERENCES "user"(id),
  channel_id       TEXT NOT NULL,
  channel_url      TEXT NOT NULL,
  channel_name     TEXT,
  channel_avatar   TEXT,
  target_count     INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 1000),
  delivered_count  INTEGER NOT NULL DEFAULT 0,
  task_type        TEXT NOT NULL CHECK(task_type IN ('PAY','CROSS_SUB')),
  price_per_unit_vnd INTEGER NOT NULL DEFAULT 0,
  xu_per_unit      INTEGER NOT NULL DEFAULT 0,
  escrow_vnd       INTEGER NOT NULL DEFAULT 0,
  escrow_xu        INTEGER NOT NULL DEFAULT 0,
  max_providers    INTEGER NOT NULL DEFAULT 3,
  priority         INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'OPEN'
                   CHECK(status IN ('OPEN','FILLING','COMPLETED','CANCELLED','EXPIRED')),
  deadline         INTEGER NOT NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

-- 3. task_claims
CREATE TABLE task_claims_new (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  claimer_id         TEXT NOT NULL REFERENCES "user"(id),
  claimer_ip_hash    TEXT,
  claimed_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  must_submit_after  INTEGER NOT NULL,
  submitted_at       INTEGER,
  verified_at        INTEGER,
  youtube_channel_id TEXT,
  xu_status          TEXT NOT NULL DEFAULT 'NONE'
                     CHECK(xu_status IN ('NONE','PENDING','LOCKED','CREDITED','CLAWED_BACK')),
  xu_amount          INTEGER NOT NULL DEFAULT 0,
  xu_locked_at       INTEGER,
  verify_attempts    INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'CLAIMED'
                     CHECK(status IN ('CLAIMED','SUBMITTED','VERIFIED','REJECTED','EXPIRED')),
  UNIQUE(task_id, youtube_channel_id)
);
INSERT OR IGNORE INTO task_claims_new SELECT * FROM task_claims;
DROP TABLE task_claims;
ALTER TABLE task_claims_new RENAME TO task_claims;

-- 4. wallet_txns
CREATE TABLE wallet_txns_new (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id),
  type       TEXT NOT NULL CHECK(type IN ('EARN','SPEND','BUY_XU','BUY_VND','CLAW_BACK','REFUND','ESCROW_LOCK','ESCROW_RELEASE')),
  amount     INTEGER NOT NULL,
  currency   TEXT NOT NULL CHECK(currency IN ('VND','XU')),
  ref_id     TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO wallet_txns_new SELECT * FROM wallet_txns;
DROP TABLE wallet_txns;
ALTER TABLE wallet_txns_new RENAME TO wallet_txns;

-- 5. user_completed_channels
CREATE TABLE user_completed_channels_new (
  user_id    TEXT NOT NULL REFERENCES "user"(id),
  channel_id TEXT NOT NULL,
  PRIMARY KEY(user_id, channel_id)
);
INSERT OR IGNORE INTO user_completed_channels_new SELECT * FROM user_completed_channels;
DROP TABLE user_completed_channels;
ALTER TABLE user_completed_channels_new RENAME TO user_completed_channels;

-- 6. ip_task_log — no FK, keep as-is

PRAGMA foreign_keys = ON;
