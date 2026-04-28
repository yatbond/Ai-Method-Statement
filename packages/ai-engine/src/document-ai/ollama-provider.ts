// =============================================================================
// Ollama Document AI provider
//
// Sends documents to an Ollama Cloud model (OpenAI-compatible API) for extraction.
// PDFs are sent as base64; DOCX falls back to native extractor.
// =============================================================================

import type { ExtractedChunk, DocumentExtractionResult } from "./index";

export class OllamaDocumentAIProvider {
  readonly provider = "ollama";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, model: string, baseURL = "https://ollama.com/v1") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
    // For DOCX, use native extractor
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const { extractDocx } = await import("./docx-extractor");
      return extractDocx(buffer);
    }

    // For PDF and images, send to Ollama Cloud via OpenAI-compatible API
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      return this.extractViaApi(buffer, mimeType);
    }

    throw new Error(`Unsupported MIME type for Ollama extraction: ${mimeType}`);
  }

  private async extractViaApi(
    buffer: Buffer,
    mimeType: string
  ): Promise<DocumentExtractionResult> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 65536,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                data: buffer.toString("base64"),
                filename: mimeType === "application/pdf" ? "document.pdf" : "image",
              },
            },
            {
              type: "text",
              text: EXTRACT_PROMPT,
            },
          ] as any,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
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
    chunks.push({
      type: "text",
      content: text,
      pageNumber: 1,
      confidence: 0.5,
    });
    errors.push({ page: 1, message: `Failed to parse structured output: ${err.message}` });
  }

  return {
    chunks,
    pageCount: Math.max(...chunks.map((c) => c.pageNumber), 1),
    ocrUsed: true,
    lowConfidencePages,
    errors,
  };
}
