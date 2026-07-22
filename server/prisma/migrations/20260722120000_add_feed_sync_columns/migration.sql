-- AlterTable
ALTER TABLE "Feed" ADD COLUMN "etag" TEXT,
                   ADD COLUMN "lastModified" TEXT,
                   ADD COLUMN "lastRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Feed_lastCheckedAt_idx" ON "Feed"("lastCheckedAt");
