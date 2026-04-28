// =============================================================================
// Gemini Document AI provider
//
// Sends documents to a Gemini multimodal model for text extraction.
// Handles PDF (sent as inline data) and DOCX (converted via native extractor).
// =============================================================================

import type { ExtractedChunk, DocumentExtractionResult } from "./index";
import { OCR_CONFIDENCE_THRESHOLD } from "./constants";

export class GeminiDocumentAIProvider {
  readonly provider = "gemini";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
    // For DOCX, use native extractor then enhance with Gemini if needed
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const { extractDocx } = await import("./docx-extractor");
      return extractDocx(buffer);
    }

    // For images, wrap as single-page extraction
    if (mimeType.startsWith("image/")) {
      return this.extractImage(buffer, mimeType);
    }

    // For PDF, send to Gemini for extraction
    if (mimeType === "application/pdf") {
      return this.extractPdf(buffer);
    }

    throw new Error(`Unsupported MIME type for Gemini extraction: ${mimeType}`);
  }

  private async extractPdf(buffer: Buffer): Promise<DocumentExtractionResult> {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const contents = [
      {
        role: "user" as const,
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          {
            text: EXTRACT_PROMPT,
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        temperature: 0.1,
        maxOutputTokens: 65536,
      },
    });

    const text = response.text ?? "";
    return parseExtractedResponse(text);
  }

  private async extractImage(
    buffer: Buffer,
    mimeType: string
  ): Promise<DocumentExtractionResult> {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const contents = [
      {
        role: "user" as const,
        parts: [
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64"),
            },
          },
          {
            text: EXTRACT_PROMPT,
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16384,
      },
    });

    const text = response.text ?? "";
    return parseExtractedResponse(text);
  }
}

const EXTRACT_PROMPT = `Extract all content from this document. Return the result as structured JSON with this exact format:

{
  "pages": [
    {
      "pageNumber": 1,
      "chunks": [
        {
          "type": "text",
          "content": "the extracted text content",
          "sectionHeading": "heading if this text belongs under a heading, null otherwise"
        },
        {
          "type": "table",
          "content": "description of the table",
          "sectionHeading": "heading or null",
          "tableData": {
            "headers": ["col1", "col2"],
            "rows": [{"col1": "val", "col2": "val"}]
          }
        },
        {
          "type": "image",
          "content": "description of the image or diagram",
          "sectionHeading": "heading or null"
        }
      ]
    }
  ]
}

Rules:
- Preserve the exact page numbers from the original document
- Detect section headings and associate chunks with them
- Extract tables as structured data with headers and rows
- Describe images and diagrams in the content field
- Do not skip any content
- Return ONLY the JSON, no markdown fences or commentary`;

function parseExtractedResponse(text: string): DocumentExtractionResult {
  const chunks: ExtractedChunk[] = [];
  const lowConfidencePages: number[] = [];
  const errors: Array<{ page: number; message: string }> = [];

  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    const pages = parsed.pages ?? [];
    for (const page of pages) {
      const pageNumber = page.pageNumber ?? 1;
      for (const chunk of page.chunks ?? []) {
        chunks.push({
          type: chunk.type === "table" ? "table" : chunk.type === "image" ? "image" : "text",
          content: chunk.content ?? "",
          pageNumber,
          sectionHeading: chunk.sectionHeading ?? undefined,
          confidence: 0.95,
          tableData: chunk.tableData ?? undefined,
        });
      }
    }
  } catch (err: any) {
    // If JSON parsing fails, treat the entire response as a single text chunk
    chunks.push({
      type: "text",
      content: text,
      pageNumber: 1,
      confidence: 0.5,
    });
    if (chunks.length > 0) {
      errors.push({ page: 1, message: `Failed to parse structured output: ${err.message}` });
    }
  }

  return {
    chunks,
    pageCount: Math.max(...chunks.map((c) => c.pageNumber), 1),
    ocrUsed: true,
    lowConfidencePages,
    errors,
  };
}
