-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- DropIndex
DROP INDEX "idx_boardmembership_board";

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "lastCommentAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCommentAt" TIMESTAMP(3),
ADD COLUMN     "lastCommentPreview" TEXT,
ADD COLUMN     "lastCommentSenderId" TEXT,
ADD COLUMN     "lastCommentVisibility" "Visibility";

-- AlterTable
ALTER TABLE "BoardMembership" ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "idx_board_last_activity" ON "Board"("lastActivity");

-- CreateIndex
CREATE INDEX "idx_board_last_comment_at" ON "Board"("lastCommentAt");

-- CreateIndex
CREATE INDEX "idx_boardmembership_user_status" ON "BoardMembership"("userId", "status");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_lastCommentSenderId_fkey" FOREIGN KEY ("lastCommentSenderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
