-- No-op: the original "FeedArticle" table this migration targeted was dropped by
-- the earlier `shared_feeds` migration, which replaced it with the shared "FeedItem"
-- table that already includes "imageUrl". This leftover migration is rewritten as an
-- idempotent no-op so a fresh `prisma migrate deploy` replays the full history without
-- failing on the missing table.
ALTER TABLE "FeedItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
