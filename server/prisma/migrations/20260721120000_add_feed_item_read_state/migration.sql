-- CreateTable
CREATE TABLE "ReadFeedItem" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadFeedItem_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateIndex
CREATE INDEX "ReadFeedItem_userId_idx" ON "ReadFeedItem"("userId");

-- AddForeignKey
ALTER TABLE "ReadFeedItem" ADD CONSTRAINT "ReadFeedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadFeedItem" ADD CONSTRAINT "ReadFeedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FeedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
