-- Migration 0007: add action_type + video fields to tasks, add task_claim_results
PRAGMA foreign_keys = OFF;

ALTER TABLE tasks ADD COLUMN action_type TEXT NOT NULL DEFAULT 'SUBSCRIBE';
ALTER TABLE tasks ADD COLUMN video_id TEXT;
ALTER TABLE tasks ADD COLUMN video_title TEXT;
ALTER TABLE tasks ADD COLUMN video_thumbnail TEXT;
ALTER TABLE tasks ADD COLUMN comment_template TEXT;

CREATE TABLE IF NOT EXISTS task_claim_results (
  claim_id    TEXT PRIMARY KEY REFERENCES task_claims(id) ON DELETE CASCADE,
  comment_id  TEXT,
  rating      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

PRAGMA foreign_keys = ON;
