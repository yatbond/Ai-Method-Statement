// =============================================================================
// Embedding provider abstraction
//
// REQ-RAG-002: The system MUST use Google Gemini Embedding 2 (text-embedding-004
// or current production-equivalent multimodal variant) as the default embedding
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
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.modelVersion });

    let content: string;
    if (request.contentType === "image" && Buffer.isBuffer(request.content)) {
      // Multimodal: base64-encode image for Gemini
      content = request.content.toString("base64");
    } else {
      content = request.content as string;
    }

    const result = await model.embedContent(content);
    const embedding = result.embedding.values;

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
