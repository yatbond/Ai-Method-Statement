// =============================================================================
// Document AI provider abstraction (REQ-ING)
//
// Pluggable provider for text, table, and image extraction from PDFs.
// REQ-ING-003: Must run OCR on scanned PDFs with confidence scoring.
// =============================================================================

export interface ExtractedChunk {
  type: "text" | "table" | "image" | "diagram";
  content: string;
  pageNumber: number;
  sectionHeading?: string;
  confidence?: number; // 0–1 for OCR'd content
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
  lowConfidencePages: number[]; // Pages below OCR_CONFIDENCE_THRESHOLD
  errors: Array<{ page: number; message: string }>;
}

export interface DocumentAIProvider {
  extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult>;
  readonly provider: string;
}

// ── Heading detection ─────────────────────────────────────────────────────────

export function detectHeadings(text: string): string[] {
  const headingPatterns = [
    /^#{1,6}\s+.+/gm,             // Markdown headings
    /^\d+(\.\d+)*\s+[A-Z].+/gm,  // Numbered sections: "1.2.3 Title"
    /^[A-Z][A-Z\s]{4,}$/gm,       // ALL CAPS lines
  ];

  const headings: string[] = [];
  for (const pattern of headingPatterns) {
    const matches = text.match(pattern) ?? [];
    headings.push(...matches.map((h) => h.trim()));
  }

  return [...new Set(headings)];
}

// ── Mock provider for development ─────────────────────────────────────────────

export class MockDocumentAIProvider implements DocumentAIProvider {
  readonly provider = "mock";

  async extract(
    buffer: Buffer,
    mimeType: string
  ): Promise<DocumentExtractionResult> {
    // Development stub — replace with real provider in production
    return {
      chunks: [
        {
          type: "text",
          content: "Sample extracted text from document.",
          pageNumber: 1,
          sectionHeading: "Introduction",
          confidence: 1.0,
        },
      ],
      pageCount: 1,
      ocrUsed: false,
      lowConfidencePages: [],
      errors: [],
    };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createDocumentAIProvider(config: {
  provider?: "google" | "azure" | "aws" | "mock";
  projectId?: string;
  location?: string;
  processorId?: string;
}): DocumentAIProvider {
  const { provider = "mock" } = config;

  if (provider === "mock") {
    return new MockDocumentAIProvider();
  }

  // TODO: Implement Google Document AI, Azure Form Recognizer, AWS Textract
  // after provider bake-off (Open Decision §13)
  throw new Error(
    `Document AI provider "${provider}" not yet implemented. ` +
      `Provider bake-off required before Phase 1.`
  );
}
