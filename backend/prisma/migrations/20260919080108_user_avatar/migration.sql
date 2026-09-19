-- DropIndex
DROP INDEX "idx_comment_content_trgm";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarData" BYTEA,
ADD COLUMN     "avatarMime" TEXT;
