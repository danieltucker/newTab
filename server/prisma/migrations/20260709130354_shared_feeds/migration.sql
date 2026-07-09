-- DropTable (per-user/per-folder article copies replaced by shared feeds)
DROP TABLE "FeedArticle";

-- CreateTable
CREATE TABLE "Feed" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "fetchUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pubDate" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readTime" INTEGER,
    "snippet" TEXT,
    "imageUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedFeedItem" (
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedFeedItem_pkey" PRIMARY KEY ("userId","folderId","itemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feed_canonicalKey_key" ON "Feed"("canonicalKey");
CREATE UNIQUE INDEX "FeedItem_feedId_link_key" ON "FeedItem"("feedId", "link");
CREATE INDEX "FeedItem_feedId_idx" ON "FeedItem"("feedId");
CREATE INDEX "DismissedFeedItem_folderId_userId_idx" ON "DismissedFeedItem"("folderId", "userId");

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedFeedItem" ADD CONSTRAINT "DismissedFeedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedFeedItem" ADD CONSTRAINT "DismissedFeedItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedFeedItem" ADD CONSTRAINT "DismissedFeedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FeedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
