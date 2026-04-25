// =============================================================================
// Reciprocal Rank Fusion (RRF) hybrid ranker
//
// Merges vector search and keyword search result lists into a single ranking.
// RRF is stable, parameter-free, and consistently outperforms simple score
// averaging when fusing rankings from different retrieval systems.
// =============================================================================

export interface RankedCandidate {
  id: string;
  extractedText: string;
  contentType: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  sourceDocumentId: string | null;
  historicalMSId: string | null;
  embeddingModelVersion: string;
  imageStorageKey: string | null;
  rrfScore: number;
  vectorSimilarity?: number;
  keywordRank?: number;
  signals: string[]; // which systems contributed to this result
}

const RRF_K = 60; // standard RRF constant

export function reciprocalRankFusion(
  vectorResults: Array<{ id: string; similarity: number } & Record<string, any>>,
  keywordResults: Array<{ id: string; rank: number } & Record<string, any>>,
  authorityBoost: Map<string, number> // passageId → authority rank boost (lower rank = higher authority)
): RankedCandidate[] {
  const scores = new Map<string, { rrf: number; signals: string[]; data: any }>();

  // Accumulate RRF from vector results
  vectorResults.forEach((hit, i) => {
    const rrfContrib = 1 / (RRF_K + i + 1);
    const existing = scores.get(hit.id);
    if (existing) {
      existing.rrf += rrfContrib;
      existing.signals.push("semantic");
    } else {
      scores.set(hit.id, {
        rrf: rrfContrib,
        signals: ["semantic"],
        data: { ...hit, vectorSimilarity: hit.similarity },
      });
    }
  });

  // Accumulate RRF from keyword results
  keywordResults.forEach((hit, i) => {
    const rrfContrib = 1 / (RRF_K + i + 1);
    const existing = scores.get(hit.id);
    if (existing) {
      existing.rrf += rrfContrib;
      existing.signals.push("keyword");
    } else {
      scores.set(hit.id, {
        rrf: rrfContrib,
        signals: ["keyword"],
        data: { ...hit, keywordRank: i + 1 },
      });
    }
  });

  // Apply authority boost: content from higher-ranked sources scores higher
  // Authority ranks 1–5 are current project docs; rank 7 = historical MS
  for (const [passageId, authorityRank] of authorityBoost.entries()) {
    const entry = scores.get(passageId);
    if (entry) {
      // Boost by up to 20% for rank-1 source, tapering to 0% for rank-9
      const boost = Math.max(0, (9 - authorityRank) / 9) * 0.2;
      entry.rrf *= 1 + boost;
    }
  }

  // Sort by RRF score descending
  return Array.from(scores.entries())
    .sort(([, a], [, b]) => b.rrf - a.rrf)
    .map(([id, entry]) => ({
      id,
      ...entry.data,
      rrfScore: entry.rrf,
      signals: [...new Set(entry.signals)],
    }));
}
