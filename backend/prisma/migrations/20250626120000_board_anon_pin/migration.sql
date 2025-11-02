-- Add anonymousEnabled and lastActivity to Board
ALTER TABLE "Board"
  ADD COLUMN IF NOT EXISTS "lastActivity" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "anonymousEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "Board" SET "lastActivity" = COALESCE("lastActivity", NOW());

-- Add pinned flag to BoardMembership
ALTER TABLE "BoardMembership"
  ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT FALSE;

-- Add createdAt to Comment
ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE "Comment" SET "createdAt" = COALESCE("createdAt", NOW());
