-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "feedLastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "feedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "FeedArticle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pubDate" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedArticle_folderId_idx" ON "FeedArticle"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedArticle_folderId_link_key" ON "FeedArticle"("folderId", "link");

-- AddForeignKey
ALTER TABLE "FeedArticle" ADD CONSTRAINT "FeedArticle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedArticle" ADD CONSTRAINT "FeedArticle_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
