-- Better Auth managed tables (v1.6+)
-- Better Auth creates these automatically but D1 needs explicit migration
-- Table names match BA defaults (user, session, account, verification)

CREATE TABLE IF NOT EXISTS "user" (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  "emailVerified"   INTEGER NOT NULL DEFAULT 0,
  image             TEXT,
  "createdAt"       INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt"       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS session (
  id            TEXT PRIMARY KEY,
  "expiresAt"   INTEGER NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  "createdAt"   INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt"   INTEGER NOT NULL DEFAULT (unixepoch()),
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id                        TEXT PRIMARY KEY,
  "accountId"               TEXT NOT NULL,
  "providerId"              TEXT NOT NULL,
  "userId"                  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"             TEXT,
  "refreshToken"            TEXT,
  "idToken"                 TEXT,
  "accessTokenExpiresAt"    INTEGER,
  "refreshTokenExpiresAt"   INTEGER,
  scope                     TEXT,
  password                  TEXT,
  "createdAt"               INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt"               INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS verification (
  id            TEXT PRIMARY KEY,
  identifier    TEXT NOT NULL,
  value         TEXT NOT NULL,
  "expiresAt"   INTEGER NOT NULL,
  "createdAt"   INTEGER NOT NULL DEFAULT (unixepoch()),
  "updatedAt"   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for fast session lookup
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_user ON session("userId");
CREATE INDEX IF NOT EXISTS idx_account_user ON account("userId");

-- Drop old ba_* stub tables from migration 0001 (they were placeholders)
DROP TABLE IF EXISTS ba_sessions;
DROP TABLE IF EXISTS ba_accounts;
DROP TABLE IF EXISTS ba_verifications;
