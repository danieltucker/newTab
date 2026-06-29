-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "feedCheckedAt" TIMESTAMP(3),
ADD COLUMN     "feedLatestAt" TIMESTAMP(3),
ADD COLUMN     "feedUrl" TEXT,
ADD COLUMN     "lastVisitedAt" TIMESTAMP(3);
