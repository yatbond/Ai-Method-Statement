// =============================================================================
// Retrieval explanation engine (REQ-RAG-003)
//
// Produces a human-readable reason for every retrieved passage.
// Rule-based: more reliable and cheaper than LLM-generated explanations.
// =============================================================================

export interface ExplainedResult {
  passageId: string;
  historicalMSId: string | null;
  sourceDocumentId: string | null;
  contentType: string;
  reason: string;
  signals: string[];
  rrfScore: number;
  vectorSimilarity?: number;
}

export interface ExplanationContext {
  queryTrade: string;
  queryActivity?: string;
  historicalMSTrades: Map<string, string>; // historicalMSId → trade name
  historicalMSTitles: Map<string, string>; // historicalMSId → title
  historicalMSTags: Map<string, Record<string, string[]>>; // historicalMSId → tag key → values
}

export function explainResult(
  candidate: {
    passageId?: string;
    id: string;
    contentType: string;
    sectionHeading: string | null;
    signals: string[];
    rrfScore: number;
    vectorSimilarity?: number;
    historicalMSId: string | null;
    sourceDocumentId: string | null;
  },
  context: ExplanationContext
): ExplainedResult {
  const reasons: string[] = [];
  const msId = candidate.historicalMSId;

  if (msId) {
    const trade = context.historicalMSTrades.get(msId);
    const title = context.historicalMSTitles.get(msId);
    const tags = context.historicalMSTags.get(msId) ?? {};

    // Trade match
    if (trade && normalise(trade) === normalise(context.queryTrade)) {
      reasons.push(`Same trade: ${trade}`);
    } else if (trade) {
      reasons.push(`Trade: ${trade}`);
    }

    // Activity match
    if (context.queryActivity) {
      const activity = tags["activity"]?.[0];
      if (activity && normalise(activity).includes(normalise(context.queryActivity))) {
        reasons.push(`Similar activity: ${activity}`);
      }
    }

    // Plant/equipment
    const plant = tags["plant"];
    if (plant && plant.length > 0) {
      reasons.push(`Similar plant: ${plant.slice(0, 2).join(", ")}`);
    }

    // Safety risk
    const risks = tags["safetyRiskType"];
    if (risks && risks.length > 0) {
      reasons.push(`Similar risk profile: ${risks.slice(0, 2).join(", ")}`);
    }

    // Section heading
    if (candidate.sectionHeading) {
      reasons.push(`Section: ${candidate.sectionHeading}`);
    }

    // Title mention
    if (title) {
      reasons.push(`From: ${truncate(title, 60)}`);
    }
  } else if (candidate.sourceDocumentId) {
    reasons.push("Current project document");
    if (candidate.sectionHeading) {
      reasons.push(`Section: ${candidate.sectionHeading}`);
    }
  }

  // Content type signal
  if (candidate.contentType === "table") {
    reasons.push("Table match");
  } else if (candidate.contentType === "image" || candidate.contentType === "diagram") {
    reasons.push("Diagram/image match (multimodal)");
  }

  // Retrieval method
  if (candidate.signals.includes("semantic") && candidate.signals.includes("keyword")) {
    reasons.push("Matched by both semantic similarity and keyword search");
  } else if (candidate.signals.includes("semantic")) {
    reasons.push("Matched by semantic similarity");
  } else if (candidate.signals.includes("keyword")) {
    reasons.push("Matched by keyword search");
  }

  const reason = reasons.length > 0
    ? reasons.slice(0, 3).join(" · ")
    : "Retrieved as relevant precedent";

  return {
    passageId: candidate.passageId ?? candidate.id,
    historicalMSId: candidate.historicalMSId,
    sourceDocumentId: candidate.sourceDocumentId,
    contentType: candidate.contentType,
    reason,
    signals: candidate.signals,
    rrfScore: candidate.rrfScore,
    vectorSimilarity: candidate.vectorSimilarity,
  };
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
