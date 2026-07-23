-- Pinned is a view flag; pinned bookmarks keep their folder membership.
ALTER TABLE "Bookmark" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- Reconcile bookmarks orphaned by the earlier "pin removes folder" behaviour:
-- mark them pinned and re-home them in the user's first folder.
UPDATE "Bookmark" b
SET "pinned" = true,
    "folderId" = (
      SELECT f.id FROM "Folder" f
      WHERE f."userId" = b."userId"
      ORDER BY f.position ASC
      LIMIT 1
    )
WHERE b."folderId" IS NULL;
