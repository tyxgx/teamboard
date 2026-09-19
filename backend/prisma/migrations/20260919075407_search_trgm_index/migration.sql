-- Speeds up in-board message search (ILIKE '%term%') with a trigram GIN index.
--
-- Defensive on purpose: creating an extension needs privileges some managed Postgres plans
-- withhold. If pg_trgm can't be enabled, skip the index instead of failing the whole deploy:
-- search still works, just with a sequential scan as before.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available (%), skipping search index', SQLERRM;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comment_content_trgm ON "Comment" USING gin (content gin_trgm_ops)';
  END IF;
END
$$;
