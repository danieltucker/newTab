-- AlterTable
ALTER TABLE "FeedArticle" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "readTime" INTEGER;
