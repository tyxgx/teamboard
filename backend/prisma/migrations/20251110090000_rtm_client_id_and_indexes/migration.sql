-- Add optional clientId column for optimistic messaging idempotency
ALTER TABLE "Comment"
ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- Composite index to make cursor pagination deterministic
CREATE INDEX IF NOT EXISTS "idx_comment_board_created_id"
  ON "Comment" ("boardId", "createdAt", "id");

-- Ensure idempotent inserts per board/client pair (allows NULL clientId duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_comment_board_client_id"
  ON "Comment" ("boardId", "clientId");

