-- Migration 005: switch the retrieval index to Gemini Embedding 2 width.
--
-- Existing 768-dimensional vectors cannot be cast to 3072 dimensions. Clear
-- them deliberately; affected passages will be re-embedded with
-- gemini-embedding-2 through the import settings re-run action.

DROP INDEX IF EXISTS source_passage_embedding_idx;

UPDATE "SourcePassage"
SET embedding = NULL,
    "embeddingModelVersion" = 'gemini-embedding-2'
WHERE embedding IS NOT NULL
   OR "embeddingModelVersion" <> 'gemini-embedding-2';

ALTER TABLE "SourcePassage"
ALTER COLUMN "embedding" TYPE vector(3072)
USING NULL::vector(3072);

-- pgvector HNSW indexes support up to 2000 dimensions for vector columns.
-- Gemini Embedding 2 returns 3072 dimensions, so exact cosine search remains
-- available through pgvector operators, but ANN indexing needs a later
-- halfvec/expression-index design once extension support is confirmed in
-- Railway Postgres.
