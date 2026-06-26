-- User groups: define max channels per group
CREATE TABLE IF NOT EXISTS user_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  max_channels INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed default group
INSERT OR IGNORE INTO user_groups (id, name, max_channels)
VALUES ('default', 'Normal User', 1);

-- Linked channels table (replaces single column on user table)
CREATE TABLE IF NOT EXISTS user_linked_channels (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  channel_id  TEXT NOT NULL,
  channel_name TEXT,
  channel_avatar TEXT,
  channel_url TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  linked_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_ulc_user ON user_linked_channels(user_id);

-- Add group_id to user table (SQLite: no DEFAULT with REFERENCES in ALTER TABLE)
ALTER TABLE "user" ADD COLUMN group_id TEXT;

-- Set existing users to default group
UPDATE "user" SET group_id = 'default' WHERE group_id IS NULL;

-- Migrate existing linked channel data from user table into user_linked_channels
INSERT OR IGNORE INTO user_linked_channels (id, user_id, channel_id, channel_name, channel_avatar, channel_url, refresh_token, linked_at)
SELECT
  lower(hex(randomblob(16))),
  id,
  youtube_channel_id,
  youtube_channel_name,
  youtube_channel_avatar,
  'https://www.youtube.com/channel/' || youtube_channel_id,
  COALESCE(youtube_refresh_token, ''),
  COALESCE(youtube_linked_at, unixepoch())
FROM "user"
WHERE youtube_channel_id IS NOT NULL;
