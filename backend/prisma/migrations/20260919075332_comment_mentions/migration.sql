-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];
