// =============================================================================
// pgvector raw SQL helpers
//
// Prisma does not natively support pgvector types, so we use $queryRaw.
// All queries are parameterised — no interpolation of user input.
// =============================================================================

import { db } from "./index";

export interface VectorSearchResult {
  id: string;
  extractedText: string;
  contentType: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  sourceDocumentId: string | null;
  historicalMSId: string | null;
  embeddingModelVersion: string;
  imageStorageKey: string | null;
  similarity: number;
}

/**
 * Cosine similarity search against SourcePassage embeddings.
 * Returns passages sorted by descending similarity.
 */
export async function vectorSearch(params: {
  embedding: number[];
  limit: number;
  tradeIds?: string[];         // restrict to passages from these trades' historical MS
  projectIds?: string[];        // restrict to passages from these projects' documents
  contentTypes?: string[];      // "text" | "table" | "image" | "diagram"
  historicalOnly?: boolean;
  projectDocumentsOnly?: boolean;
  modelVersion?: string;
}): Promise<VectorSearchResult[]> {
  const {
    embedding,
    limit,
    contentTypes,
    historicalOnly,
    projectDocumentsOnly,
    modelVersion,
  } = params;

  const vectorLiteral = `[${embedding.join(",")}]`;

  // Build the WHERE clauses safely using Prisma's tagged template literal
  // for the parameterised vector, then append static structural filters.
  // Because we can only pass one vector param via $queryRaw, we build
  // a combined query.
  const rows = await db.$queryRaw<VectorSearchResult[]>`
    SELECT
      sp.id,
      sp."extractedText",
      sp."contentType",
      sp."pageNumber",
      sp."sectionHeading",
      sp."sourceDocumentId",
      sp."historicalMSId",
      sp."embeddingModelVersion",
      sp."imageStorageKey",
      1 - (sp.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "SourcePassage" sp
    WHERE
      sp.embedding IS NOT NULL
      AND sp."deletedAt" IS NULL
      ${historicalOnly ? db.$queryRaw`AND sp."historicalMSId" IS NOT NULL` : db.$queryRaw``}
      ${projectDocumentsOnly ? db.$queryRaw`AND sp."sourceDocumentId" IS NOT NULL` : db.$queryRaw``}
      ${modelVersion ? db.$queryRaw`AND sp."embeddingModelVersion" = ${modelVersion}` : db.$queryRaw``}
      ${contentTypes && contentTypes.length > 0
        ? db.$queryRaw`AND sp."contentType" = ANY(${contentTypes}::text[])`
        : db.$queryRaw``
      }
    ORDER BY sp.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;

  return rows;
}

/**
 * Full-text keyword search using PostgreSQL tsvector.
 */
export interface KeywordSearchResult {
  id: string;
  extractedText: string;
  contentType: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  sourceDocumentId: string | null;
  historicalMSId: string | null;
  embeddingModelVersion: string;
  imageStorageKey: string | null;
  rank: number;
}

export async function keywordSearch(params: {
  query: string;
  limit: number;
  historicalOnly?: boolean;
}): Promise<KeywordSearchResult[]> {
  const { query, limit, historicalOnly } = params;

  // Convert query to tsquery — wrap each word in prefix search
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  if (!tsQuery) return [];

  const rows = await db.$queryRaw<KeywordSearchResult[]>`
    SELECT
      sp.id,
      sp."extractedText",
      sp."contentType",
      sp."pageNumber",
      sp."sectionHeading",
      sp."sourceDocumentId",
      sp."historicalMSId",
      sp."embeddingModelVersion",
      sp."imageStorageKey",
      ts_rank(to_tsvector('english', sp."extractedText"), to_tsquery('english', ${tsQuery})) AS rank
    FROM "SourcePassage" sp
    WHERE
      to_tsvector('english', sp."extractedText") @@ to_tsquery('english', ${tsQuery})
      ${historicalOnly ? db.$queryRaw`AND sp."historicalMSId" IS NOT NULL` : db.$queryRaw``}
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return rows;
}
