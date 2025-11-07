-- Speeds up board history fetches and delta backfills
CREATE INDEX IF NOT EXISTS "Comment_board_createdAt_idx"
  ON "Comment" ("boardId", "createdAt");

-- Optimises visibility filtering (EVERYONE / ADMIN_ONLY / own messages)
CREATE INDEX IF NOT EXISTS "Comment_board_vis_creator_idx"
  ON "Comment" ("boardId", "visibility", "createdById");

-- Ensures quick lookup by board code
CREATE UNIQUE INDEX IF NOT EXISTS "Board_code_unique"
  ON "Board" ("code");

-- Guards against duplicate memberships and speeds membership checks
CREATE UNIQUE INDEX IF NOT EXISTS "BoardMembership_user_board_unique"
  ON "BoardMembership" ("userId", "boardId");
