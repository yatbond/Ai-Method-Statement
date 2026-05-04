// =============================================================================
// Ollama Document AI provider
//
// Sends documents to an Ollama Cloud model (OpenAI-compatible API) for extraction.
// PDFs are parsed locally first because Ollama's OpenAI-compatible endpoint does
// not reliably accept raw PDF file bodies.
// =============================================================================

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtractedChunk, DocumentExtractionResult } from "./index";

const PDF_RENDER_SCALE = 1.6;

export class OllamaDocumentAIProvider {
  readonly provider = "ollama";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly shouldCancel?: () => Promise<boolean>;

  constructor(
    apiKey: string,
    model: string,
    baseURL = "http://localhost:11434",
    shouldCancel?: () => Promise<boolean>
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
    this.shouldCancel = shouldCancel;
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

    if (mimeType === "application/pdf") {
      return this.extractPdf(buffer);
    }

    if (mimeType.startsWith("image/")) {
      return this.extractImageViaApi(buffer, mimeType);
    }

    throw new Error(`Unsupported MIME type for Ollama extraction: ${mimeType}`);
  }

  private async extractPdf(buffer: Buffer): Promise<DocumentExtractionResult> {
    const { extractPdf } = await import("./pdf-extractor");
    const nativeExtraction = await extractPdf(buffer);
    const extractedText = serializeExtractionForPrompt(nativeExtraction);

    if (!extractedText.trim()) {
      return this.extractScannedPdfWithOcr(buffer);
    }

    // Keep ingestion reliable for large method statements: native extraction is
    // complete, while sending very large PDFs through a chat API can timeout.
    if (extractedText.length > 45000) {
      return {
        ...nativeExtraction,
        errors: [
          ...nativeExtraction.errors,
          {
            page: 1,
            message: "Ollama structuring skipped because extracted PDF text exceeded the safe request size.",
          },
        ],
      };
    }

    try {
      const text = await this.extractTextViaApi(
        `${EXTRACT_PROMPT}\n\nDocument text already extracted from the PDF:\n\n${extractedText}`
      );
      const structured = parseExtractedResponse(text);
      return structured.chunks.length > 0
        ? { ...structured, ocrUsed: nativeExtraction.ocrUsed || structured.ocrUsed }
        : nativeExtraction;
    } catch (error: any) {
      return {
        ...nativeExtraction,
        errors: [
          ...nativeExtraction.errors,
          { page: 1, message: `Ollama structuring failed; native PDF extraction used instead: ${error.message}` },
        ],
      };
    }
  }

  private async extractImageViaApi(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
    if (isNativeOllamaBaseURL(this.baseURL)) {
      const text = await this.extractImageViaNativeOllama(buffer);
      return parseExtractedResponse(text);
    }

    const text = await this.extractTextViaApi(EXTRACT_PROMPT, [
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
      },
    ]);
    return parseExtractedResponse(text);
  }

  private async extractTextViaApi(prompt: string, leadingContent: any[] = []): Promise<string> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL, timeout: 120000 });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 16384,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            ...leadingContent,
            {
              type: "text",
              text: prompt,
            },
          ] as any,
        },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  private async extractScannedPdfWithOcr(buffer: Buffer): Promise<DocumentExtractionResult> {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    const chunks: ExtractedChunk[] = [];
    const errors: Array<{ page: number; message: string }> = [];

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ams-ollama-ocr-"));
    const pdfPath = path.join(tempDir, "source.pdf");
    try {
      await writeFile(pdfPath, buffer);

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        await this.assertNotCancelled();
        const pageNumber = pageIndex + 1;
        try {
          const pageImage = await renderPdfPageToPng(pdfPath, pageIndex);
          const text = await this.extractImageViaNativeOllama(pageImage, pageNumber);
          const cleaned = cleanOcrText(text);
          if (cleaned) {
            chunks.push({
              type: "text",
              content: cleaned,
              pageNumber,
              confidence: 0.85,
            });
          }
        } catch (error: any) {
          errors.push({ page: pageNumber, message: error.message });
        }
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }

    return {
      chunks,
      pageCount,
      ocrUsed: true,
      lowConfidencePages: errors.map((error) => error.page),
      errors,
    };
  }

  private async extractImageViaNativeOllama(buffer: Buffer, pageNumber = 1): Promise<string> {
    const response = await fetch(nativeOllamaChatURL(this.baseURL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          {
            role: "user",
            content:
              `Text Recognition: Extract all readable text from this method statement page. ` +
              `Preserve headings, numbered clauses, table text, quantities, dates, and references. ` +
              `Return plain text only. Page ${pageNumber}.`,
            images: [buffer.toString("base64")],
          },
        ],
        options: {
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Ollama OCR failed (${response.status}): ${detail || response.statusText}`);
    }

    const data: any = await response.json();
    return data.message?.content ?? "";
  }

  private async assertNotCancelled() {
    if (this.shouldCancel && (await this.shouldCancel())) {
      throw new Error("Ingestion cancelled by user.");
    }
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

async function renderPdfPageToPng(pdfPath: string, pageIndex: number): Promise<Buffer> {
  const script = `
import fitz
import sys

doc = fitz.open(sys.argv[1])
page = doc.load_page(int(sys.argv[2]))
pix = page.get_pixmap(matrix=fitz.Matrix(float(sys.argv[3]), float(sys.argv[3])), alpha=False)
sys.stdout.buffer.write(pix.tobytes("png"))
`;

  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", script, pdfPath, String(pageIndex), String(PDF_RENDER_SCALE)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errorChunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(Buffer.concat(errorChunks).toString("utf8") || `Python PDF render failed with code ${code}`));
      }
    });
  });
}

function isNativeOllamaBaseURL(baseURL: string) {
  const normalized = baseURL.replace(/\/+$/, "");
  return normalized.endsWith(":11434") || normalized.endsWith(":11434/api");
}

function nativeOllamaChatURL(baseURL: string) {
  const normalized = baseURL.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? `${normalized}/chat` : `${normalized}/api/chat`;
}

function cleanOcrText(text: string) {
  return text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function serializeExtractionForPrompt(extraction: DocumentExtractionResult): string {
  return extraction.chunks
    .map((chunk) => {
      const heading = chunk.sectionHeading ? `\nHeading: ${chunk.sectionHeading}` : "";
      return `Page ${chunk.pageNumber}${heading}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

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
