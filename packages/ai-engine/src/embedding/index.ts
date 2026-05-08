// =============================================================================
// Embedding provider abstraction
//
// REQ-RAG-002: The system MUST use Google Gemini Embedding 2 as the embedding
// model. Text-only embedding models MUST NOT be used.
// =============================================================================

import type { EmbeddingRequest, EmbeddingResponse } from "@ams/shared";
import { REQUIRED_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "@ams/shared";

export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  embedBatch(requests: EmbeddingRequest[]): Promise<EmbeddingResponse[]>;
  readonly modelVersion: string;
  readonly dimensions: number;
}

// ── Gemini Embedding 2 (required default) ────────────────────────────────────

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelVersion: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly apiKey: string;

  constructor(apiKey: string, modelVersion = REQUIRED_EMBEDDING_MODEL) {
    this.apiKey = apiKey;
    this.modelVersion = modelVersion;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    let part: { text: string } | { inlineData: { mimeType: string; data: string } };
    if (request.contentType === "image" && Buffer.isBuffer(request.content)) {
      part = {
        inlineData: {
          mimeType: "image/png",
          data: request.content.toString("base64"),
        },
      };
    } else {
      part = { text: request.content as string };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modelVersion}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: `models/${this.modelVersion}`,
          content: { parts: [part] },
          outputDimensionality: this.dimensions,
        }),
      }
    );
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        result?.error?.message ??
          `Gemini Embedding 2 request failed with status ${response.status}.`
      );
    }
    const embedding = result?.embedding?.values;
    if (!Array.isArray(embedding)) {
      throw new Error("Gemini Embedding 2 response did not include an embedding vector.");
    }
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `Gemini Embedding 2 returned ${embedding.length} dimensions; expected ${this.dimensions}.`
      );
    }

    return {
      embedding,
      modelVersion: this.modelVersion,
    };
  }

  async embedBatch(requests: EmbeddingRequest[]): Promise<EmbeddingResponse[]> {
    // Gemini supports batch embedding
    return Promise.all(requests.map((r) => this.embed(r)));
  }
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createEmbeddingProvider(config: {
  provider?: "gemini";
  apiKey: string;
  modelVersion?: string;
}): EmbeddingProvider {
  const { provider = "gemini", apiKey, modelVersion } = config;

  if (provider !== "gemini") {
    throw new Error(
      `Embedding provider "${provider}" is not supported. ` +
        `Only Gemini Embedding 2 is permitted (REQ-RAG-002). ` +
        `Text-only models such as OpenAI text-embedding-3 and Cohere embed-v3 ` +
        `cannot embed diagrams and tables and must not be used.`
    );
  }

  return new GeminiEmbeddingProvider(apiKey, modelVersion);
}
