-- AlterTable
ALTER TABLE "FeedItem" ADD COLUMN "content" TEXT,
                       ADD COLUMN "linkKey" TEXT;

-- CreateIndex
CREATE INDEX "FeedItem_linkKey_idx" ON "FeedItem"("linkKey");
