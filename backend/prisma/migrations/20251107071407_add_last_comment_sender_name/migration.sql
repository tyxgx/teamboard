-- DropIndex
DROP INDEX "Comment_board_vis_creator_idx";

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "lastCommentSenderName" TEXT;

-- CreateIndex
CREATE INDEX "idx_boardmembership_user" ON "BoardMembership"("userId");

-- CreateIndex
CREATE INDEX "idx_comment_created_by" ON "Comment"("createdById");

-- CreateIndex
CREATE INDEX "idx_comment_board_visibility_created" ON "Comment"("boardId", "visibility", "createdAt");
