// =============================================================================
// Document AI provider abstraction (REQ-ING)
//
// Pluggable provider for text, table, and image extraction from PDFs/DOCX.
// REQ-ING-003: Runs OCR on scanned PDFs with per-page confidence scoring.
// REQ-ING-004: Every chunk retains document ID, page number, section context.
// =============================================================================

export { OCR_CONFIDENCE_THRESHOLD } from "./constants";

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

export function createDocumentAIProvider(config?: {
  provider?: "native" | "google" | "mock";
  projectId?: string;
  location?: string;
  processorId?: string;
}): DocumentAIProvider {
  const provider = config?.provider ?? "native";

  if (provider === "native" || provider === "mock") {
    return new NativeDocumentAIProvider();
  }

  // TODO: Google Document AI after provider bake-off (Open Decision §13)
  throw new Error(
    `Document AI provider "${provider}" not yet implemented. ` +
      `Provider bake-off required before Phase 1.`
  );
}
