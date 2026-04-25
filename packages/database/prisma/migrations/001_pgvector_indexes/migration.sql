-- =============================================================================
-- Migration 001: Enable pgvector and create search indexes
-- =============================================================================

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index for approximate nearest-neighbour vector search
-- m=16, ef_construction=64 is a good default for retrieval quality vs build time
CREATE INDEX IF NOT EXISTS source_passage_embedding_idx
ON "SourcePassage"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN index for PostgreSQL full-text keyword search
CREATE INDEX IF NOT EXISTS source_passage_fts_idx
ON "SourcePassage"
USING GIN (to_tsvector('english', "extractedText"));

-- Partial index: only index passages that have embeddings and belong to historical MS
CREATE INDEX IF NOT EXISTS source_passage_historical_idx
ON "SourcePassage" ("historicalMSId")
WHERE "historicalMSId" IS NOT NULL AND embedding IS NOT NULL;

-- Partial index for project document passages
CREATE INDEX IF NOT EXISTS source_passage_project_idx
ON "SourcePassage" ("sourceDocumentId")
WHERE "sourceDocumentId" IS NOT NULL;

-- Index for embedding model version queries (REQ-RAG-006)
CREATE INDEX IF NOT EXISTS source_passage_model_version_idx
ON "SourcePassage" ("embeddingModelVersion");
