// =============================================================================
// Document AI provider abstraction (REQ-ING)
//
// Pluggable provider for text, table, and image extraction from PDFs/DOCX.
// REQ-ING-003: Runs OCR on scanned PDFs with per-page confidence scoring.
// REQ-ING-004: Every chunk retains document ID, page number, section context.
// =============================================================================

export { OCR_CONFIDENCE_THRESHOLD } from "./constants";
export { tagDocument, type DocumentTags } from "./metadata-tagger";

export interface ExtractedChunk {
  type: "text" | "table" | "image" | "diagram";
  content: string;
  pageNumber: number;
  sectionHeading?: string;
  confidence?: number;
  tableData?: {
    headers: string[];
    rows: Record<string, string>[];
  };
  imageData?: Buffer;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface DocumentExtractionResult {
  chunks: ExtractedChunk[];
  pageCount: number;
  ocrUsed: boolean;
  lowConfidencePages: number[];
  errors: Array<{ page: number; message: string }>;
}

export interface DocumentAIProvider {
  extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult>;
  readonly provider: string;
}

// ── Native provider (built-in PDF + DOCX parsing) ────────────────────────────

export class NativeDocumentAIProvider implements DocumentAIProvider {
  readonly provider = "native";

  async extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
    if (mimeType === "application/pdf") {
      const { extractPdf } = await import("./pdf-extractor");
      return extractPdf(buffer);
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const { extractDocx } = await import("./docx-extractor");
      return extractDocx(buffer);
    }

    if (mimeType.startsWith("image/")) {
      return {
        chunks: [
          {
            type: "image",
            content: "[image]",
            pageNumber: 1,
            imageData: buffer,
            confidence: 1.0,
          },
        ],
        pageCount: 1,
        ocrUsed: false,
        lowConfidencePages: [],
        errors: [],
      };
    }

    throw new Error(`Unsupported MIME type for extraction: ${mimeType}`);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

type DocAIProvider = "native" | "gemini" | "ollama" | "openrouter";

export function createDocumentAIProvider(config?: {
  provider?: DocAIProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}): DocumentAIProvider {
  const provider = config?.provider ?? "native";

  if (provider === "native") {
    return new NativeDocumentAIProvider();
  }

  throw new Error(
    `Document AI provider "${provider}" requires async loading. ` +
      `Use getDocumentAIConfigFromEnv() and pass the result to createDocumentAIProviderAsync().`
  );
}

export async function createDocumentAIProviderAsync(config?: {
  provider?: DocAIProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}): Promise<DocumentAIProvider> {
  const provider = config?.provider ?? "native";

  if (provider === "native") {
    return new NativeDocumentAIProvider();
  }

  if (provider === "gemini") {
    const { GeminiDocumentAIProvider } = await import("./gemini-provider");
    const apiKey = config?.apiKey;
    if (!apiKey) throw new Error("DOCUMENT_AI_API_KEY not configured for Gemini Document AI");
    if (!config?.model) throw new Error("DOCUMENT_AI_MODEL is required for Gemini Document AI");
    return new GeminiDocumentAIProvider(apiKey, config.model!);
  }

  if (provider === "ollama") {
    const { OllamaDocumentAIProvider } = await import("./ollama-provider");
    const apiKey = config?.apiKey;
    if (!apiKey) throw new Error("DOCUMENT_AI_API_KEY not configured for Ollama Document AI");
    if (!config?.model) throw new Error("DOCUMENT_AI_MODEL is required for Ollama Document AI");
    return new OllamaDocumentAIProvider(apiKey, config.model!, config?.baseURL);
  }

  if (provider === "openrouter") {
    const { OpenRouterDocumentAIProvider } = await import("./openrouter-provider");
    const apiKey = config?.apiKey;
    if (!apiKey) throw new Error("DOCUMENT_AI_API_KEY not configured for OpenRouter Document AI");
    if (!config?.model) throw new Error("DOCUMENT_AI_MODEL is required for OpenRouter Document AI");
    return new OpenRouterDocumentAIProvider(apiKey, config.model!, config?.baseURL);
  }

  throw new Error(`Unknown Document AI provider: "${provider}"`);
}

// ── Shared config helper — resolves Document AI settings from env vars ────────

export function getDocumentAIConfigFromEnv(): {
  provider: DocAIProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
} {
  const provider = (process.env.DOCUMENT_AI_PROVIDER as DocAIProvider) ?? "native";

  if (provider === "native") {
    return { provider: "native" };
  }

  // All AI providers use dedicated DOCUMENT_AI_* env vars
  const apiKey = process.env.DOCUMENT_AI_API_KEY;
  const model = process.env.DOCUMENT_AI_MODEL;
  const baseURL = process.env.DOCUMENT_AI_BASE_URL;

  return { provider, apiKey, model, baseURL };
}
