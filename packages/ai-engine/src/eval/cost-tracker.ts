// =============================================================================
// AI Cost Tracker (REQ-NFR-COST, Phase 9)
//
// Estimates GBP cost per AI operation and writes AICostRecord rows.
// Token cost rates are approximations — update when provider pricing changes.
// =============================================================================

// Cost in GBP per 1M tokens (approximate, mid-2025 rates)
const COST_RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":          { input: 2.40, output: 12.00 },
  "claude-opus-4-7":            { input: 12.00, output: 60.00 },
  "claude-haiku-4-5-20251001":  { input: 0.20, output: 1.00 },
  "gpt-4o":                     { input: 3.94, output: 15.75 },
  "text-embedding-004":         { input: 0.00, output: 0.00 }, // free tier
};

export interface CostRecord {
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  embeddingUnits?: number;
  estimatedCostGbp: number;
  methodStatementId?: string;
  projectId?: string;
}

export function estimateCostGbp(params: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  embeddingUnits?: number;
}): number {
  const rates = COST_RATES[params.model];
  if (!rates) return 0;

  const inputCost = ((params.inputTokens ?? 0) / 1_000_000) * rates.input;
  const outputCost = ((params.outputTokens ?? 0) / 1_000_000) * rates.output;
  return Math.round((inputCost + outputCost) * 10_000) / 10_000; // 4dp precision
}

export function buildCostRecord(params: {
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  embeddingUnits?: number;
  methodStatementId?: string;
  projectId?: string;
}): CostRecord {
  return {
    ...params,
    estimatedCostGbp: estimateCostGbp({
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      embeddingUnits: params.embeddingUnits,
    }),
  };
}
