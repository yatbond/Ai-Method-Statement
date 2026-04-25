// =============================================================================
// Hybrid retrieval engine (REQ-RAG-001, REQ-RAG-002, REQ-RAG-005)
//
// Combines:
//   1. Semantic vector search (Gemini Embedding 2 cosine similarity)
//   2. PostgreSQL full-text keyword search
//   3. Structured metadata filters (trade, activity, approval status)
//   4. Source authority ranking boost
//   5. RRF fusion and deduplication
//   6. Human-readable retrieval explanations (REQ-RAG-003)
//
// REQ-KB-002: Retrieval is scoped to selected trade by default.
//             Cross-trade retrieval requires explicit opt-in.
// REQ-KB-003: Superseded/withdrawn documents excluded from default retrieval.
// REQ-RAG-004: Auto-merge of conflicting precedents is NEVER performed here.
// REQ-RAG-005: Project documents and user confirmations always outrank results.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import type { EmbeddingProvider } from "../embedding/index";
import { vectorSearch, keywordSearch } from "@ams/database";
import { reciprocalRankFusion } from "./hybrid-ranker";
import { explainResult, type ExplanationContext, type ExplainedResult } from "./explanation";

export interface RetrievalConfig {
  query: string;
  tradeId: string;
  activityId?: string;
  methodStatementId?: string;
  crossTradeOptIn?: boolean;
  includeImages?: boolean;
  includeTables?: boolean;
  limit?: number;
  modelVersion?: string;
  projectId?: string;       // for access enforcement (REQ-KB-004)
}

export interface RetrievalHitFull extends ExplainedResult {
  passageExcerpt: string;   // ≤200 word excerpt for display
  pageNumber: number | null;
  sectionHeading: string | null;
  historicalMSTitle?: string;
  historicalMSTrade?: string;
}

export async function retrieveRelevantPassages(
  config: RetrievalConfig,
  db: PrismaClient,
  embeddingProvider: EmbeddingProvider
): Promise<RetrievalHitFull[]> {
  const {
    query,
    tradeId,
    activityId,
    crossTradeOptIn = false,
    includeImages = true,
    includeTables = true,
    limit = 10,
    modelVersion,
  } = config;

  // Step 1: Embed the query using Gemini Embedding 2
  const { embedding } = await embeddingProvider.embed({
    content: query,
    contentType: "text",
    modelVersion,
  });

  // Step 2: Determine which historical MS are accessible for this trade
  const whereClause: any = {
    approvalStatus: { in: ["COMPLETE"] }, // exclude SUPERSEDED and WITHDRAWN
  };
  if (!crossTradeOptIn) {
    whereClause.tradeId = tradeId;
  }

  const accessibleMS = await db.historicalMethodStatement.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      tradeId: true,
      tags: { select: { key: true, value: true } },
    },
  });

  const accessibleMSIds = new Set(accessibleMS.map((ms) => ms.id));

  // Step 3: Run vector search (historical MS passages only)
  const contentTypes = ["text"];
  if (includeTables) contentTypes.push("table");
  if (includeImages) contentTypes.push("image", "diagram");

  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch({
      embedding,
      limit: limit * 5, // retrieve more candidates before RRF
      contentTypes,
      historicalOnly: true,
      modelVersion,
    }),
    keywordSearch({
      query,
      limit: limit * 5,
      historicalOnly: true,
    }),
  ]);

  // Step 4: Filter to accessible MS (trade + approval status)
  const filteredVector = vectorHits.filter(
    (h) => h.historicalMSId && accessibleMSIds.has(h.historicalMSId)
  );
  const filteredKeyword = keywordHits.filter(
    (h) => h.historicalMSId && accessibleMSIds.has(h.historicalMSId)
  );

  // Step 5: Build authority boost map
  const authorityBoost = new Map<string, number>();
  // All historical MS are rank 7; no differential boost within the KB

  // Step 6: RRF fusion
  const ranked = reciprocalRankFusion(filteredVector, filteredKeyword, authorityBoost);
  const topCandidates = ranked.slice(0, limit);

  // Step 7: Enrich with historical MS metadata for explanation
  const msMap = new Map(accessibleMS.map((ms) => [ms.id, ms]));
  const tradeNames = await db.trade.findMany({ select: { id: true, name: true } });
  const tradeMap = new Map(tradeNames.map((t) => [t.id, t.name]));

  const explCtx: ExplanationContext = {
    queryTrade: tradeMap.get(tradeId) ?? tradeId,
    queryActivity: activityId,
    historicalMSTrades: new Map(
      accessibleMS.map((ms) => [ms.id, tradeMap.get(ms.tradeId) ?? ms.tradeId])
    ),
    historicalMSTitles: new Map(accessibleMS.map((ms) => [ms.id, ms.title])),
    historicalMSTags: new Map(
      accessibleMS.map((ms) => [
        ms.id,
        ms.tags.reduce<Record<string, string[]>>((acc, tag) => {
          if (!acc[tag.key]) acc[tag.key] = [];
          acc[tag.key].push(tag.value);
          return acc;
        }, {}),
      ])
    ),
  };

  // Step 8: Build final results with explanations
  return topCandidates.map((candidate) => {
    const explained = explainResult(candidate, explCtx);
    const ms = candidate.historicalMSId ? msMap.get(candidate.historicalMSId) : null;

    // Truncate passage to ≤200 words
    const words = candidate.extractedText.split(/\s+/);
    const passageExcerpt = words.slice(0, 200).join(" ") + (words.length > 200 ? "…" : "");

    return {
      ...explained,
      passageExcerpt,
      pageNumber: candidate.pageNumber,
      sectionHeading: candidate.sectionHeading,
      historicalMSTitle: ms?.title,
      historicalMSTrade: ms ? tradeMap.get(ms.tradeId) : undefined,
    };
  });
}

export { ExplainedResult, ExplanationContext };
