CREATE TABLE IF NOT EXISTS deposit_invoices (
  id TEXT PRIMARY KEY,                    -- Confirmo invoice ID
  user_id TEXT NOT NULL REFERENCES "user"(id),
  amount_usd REAL NOT NULL,               -- USD amount requested
  coin_amount INTEGER NOT NULL,           -- coins to credit on completion
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | EXPIRED | FAILED
  checkout_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_user ON deposit_invoices(user_id);
