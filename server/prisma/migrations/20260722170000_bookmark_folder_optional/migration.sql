-- Make Bookmark.folderId nullable so a bookmark can live "unfiled" (pinned) at
-- the top of the sidebar, physically removed from any folder.
ALTER TABLE "Bookmark" ALTER COLUMN "folderId" DROP NOT NULL;
