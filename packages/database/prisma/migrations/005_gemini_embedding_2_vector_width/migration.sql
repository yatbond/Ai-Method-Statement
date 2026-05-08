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

CREATE INDEX IF NOT EXISTS source_passage_embedding_idx
ON "SourcePassage"
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;
