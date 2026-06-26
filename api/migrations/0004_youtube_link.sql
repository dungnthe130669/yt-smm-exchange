-- Add YouTube channel link columns to Better Auth "user" table
ALTER TABLE "user" ADD COLUMN youtube_channel_id TEXT;
ALTER TABLE "user" ADD COLUMN youtube_channel_name TEXT;
ALTER TABLE "user" ADD COLUMN youtube_channel_avatar TEXT;
ALTER TABLE "user" ADD COLUMN youtube_refresh_token TEXT;
ALTER TABLE "user" ADD COLUMN youtube_linked_at INTEGER;
