-- Performance indexes to speed up common queries
CREATE INDEX IF NOT EXISTS "idx_comment_board_created" ON "Comment"("boardId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_boardmembership_board" ON "BoardMembership"("boardId");
