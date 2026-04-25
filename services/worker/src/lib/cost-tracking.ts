// =============================================================================
// Cost-tracking LLM provider wrapper (REQ-NFR-COST, Phase 10)
//
// Wraps any LLMProvider and writes an AICostRecord to the database after
// each completion call, keyed to the methodStatementId and/or projectId.
// =============================================================================

import { db } from "@ams/database";
import { buildCostRecord, type LLMProvider } from "@ams/ai-engine";
import type { LLMRequest, LLMResponse } from "@ams/shared";

interface CostTrackingOptions {
  operation: string;
  methodStatementId?: string;
  projectId?: string;
}

export class CostTrackingLLMProvider implements LLMProvider {
  private inner: LLMProvider;
  private options: CostTrackingOptions;

  constructor(inner: LLMProvider, options: CostTrackingOptions) {
    this.inner = inner;
    this.options = options;
  }

  get provider(): string {
    return this.inner.provider;
  }

  get model(): string {
    return this.inner.model;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.inner.complete(request);

    try {
      const record = buildCostRecord({
        provider: response.provider,
        model: response.model,
        operation: this.options.operation,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        methodStatementId: this.options.methodStatementId,
        projectId: this.options.projectId,
      });

      await db.aICostRecord.create({
        data: {
          provider: record.provider,
          operation: record.operation,
          model: record.model,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          estimatedCostGbp: record.estimatedCostGbp,
          methodStatementId: record.methodStatementId,
          projectId: record.projectId,
        },
      });
    } catch {
      // Non-fatal — cost recording must never break the primary operation
    }

    return response;
  }
}
