// =============================================================================
// Gemini Document AI provider
//
// Sends documents to a Gemini multimodal model for text extraction.
// Handles PDF (sent as inline data) and DOCX (converted via native extractor).
// =============================================================================

import type { ExtractedChunk, DocumentExtractionResult } from "./index";
import { OCR_CONFIDENCE_THRESHOLD } from "./constants";

const INLINE_PDF_LIMIT_BYTES = 18 * 1024 * 1024;
const GEMINI_PDF_LIMIT_BYTES = 50 * 1024 * 1024;
const PDF_BATCH_PAGE_COUNT = 24;

export class GeminiDocumentAIProvider {
  readonly provider = "gemini";
  readonly model: string;

  private readonly apiKey: string;
  private readonly shouldCancel?: () => Promise<boolean>;

  constructor(apiKey: string, model = "gemini-2.5-flash", shouldCancel?: () => Promise<boolean>) {
    this.apiKey = apiKey;
    this.model = model;
    this.shouldCancel = shouldCancel;
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
    const nativeExtraction = await tryNativePdfExtraction(buffer);
    if (nativeExtraction?.chunks.length) {
      return nativeExtraction;
    }

    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();

    if (buffer.length > INLINE_PDF_LIMIT_BYTES || pageCount > PDF_BATCH_PAGE_COUNT) {
      return this.extractPdfInBatches(pdf, pageCount);
    }

    const result = await this.extractPdfPart(buffer, EXTRACT_PROMPT);
    return { ...result, pageCount };
  }

  private async extractPdfInBatches(
    pdf: import("pdf-lib").PDFDocument,
    pageCount: number
  ): Promise<DocumentExtractionResult> {
    const chunks: ExtractedChunk[] = [];
    const lowConfidencePages: number[] = [];
    const errors: Array<{ page: number; message: string }> = [];

    let startPageIndex = 0;
    while (startPageIndex < pageCount) {
      await this.assertNotCancelled();

      let endPageIndex = Math.min(startPageIndex + PDF_BATCH_PAGE_COUNT, pageCount);
      let slice = await createPdfSlice(pdf, startPageIndex, endPageIndex);

      while (slice.length > GEMINI_PDF_LIMIT_BYTES && endPageIndex - startPageIndex > 1) {
        endPageIndex = startPageIndex + Math.ceil((endPageIndex - startPageIndex) / 2);
        slice = await createPdfSlice(pdf, startPageIndex, endPageIndex);
      }

      if (slice.length > GEMINI_PDF_LIMIT_BYTES) {
        throw new Error(
          `PDF page ${startPageIndex + 1} is ${(slice.length / 1024 / 1024).toFixed(1)} MB; Gemini document processing supports request files up to 50 MB. Split or compress this PDF before ingestion.`
        );
      }

      const prompt = makeBatchPrompt(startPageIndex + 1, endPageIndex);
      const result = await this.extractPdfPart(slice, prompt);
      await this.assertNotCancelled();
      const pageOffset = startPageIndex;
      const batchPageCount = endPageIndex - startPageIndex;

      for (const chunk of result.chunks) {
        chunks.push({
          ...chunk,
          pageNumber: normalizeBatchPageNumber(chunk.pageNumber, pageOffset, batchPageCount),
        });
      }
      lowConfidencePages.push(
        ...result.lowConfidencePages.map((page) =>
          normalizeBatchPageNumber(page, pageOffset, batchPageCount)
        )
      );
      errors.push(
        ...result.errors.map((error) => ({
          ...error,
          page: normalizeBatchPageNumber(error.page, pageOffset, batchPageCount),
        }))
      );

      startPageIndex = endPageIndex;
    }

    return {
      chunks,
      pageCount,
      ocrUsed: true,
      lowConfidencePages: [...new Set(lowConfidencePages)].sort((a, b) => a - b),
      errors,
    };
  }

  private async extractPdfPart(
    buffer: Buffer,
    prompt: string
  ): Promise<DocumentExtractionResult> {
    await this.assertNotCancelled();

    const { createPartFromUri, GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    let contents: any[] = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
    ];

    if (buffer.length > INLINE_PDF_LIMIT_BYTES) {
      const file = await ai.files.upload({
        file: new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
        config: {
          displayName: "method-statement.pdf",
          mimeType: "application/pdf",
        },
      });

      let uploadedFile = await ai.files.get({ name: file.name! });
      let checks = 0;
      while (uploadedFile.state === "PROCESSING" && checks < 36) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        uploadedFile = await ai.files.get({ name: file.name! });
        checks += 1;
      }
      if (uploadedFile.state === "PROCESSING") {
        throw new Error("Gemini file upload is still processing after 3 minutes.");
      }
      if (uploadedFile.state === "FAILED") {
        throw new Error("Gemini file upload failed while processing the PDF.");
      }
      if (!uploadedFile.uri || !uploadedFile.mimeType) {
        throw new Error("Gemini file upload did not return a usable file URI.");
      }

      contents = [prompt, createPartFromUri(uploadedFile.uri, uploadedFile.mimeType)];
    }

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          temperature: 0.1,
          maxOutputTokens: 16384,
        },
      });
    } catch (error: any) {
      throw new Error(formatGeminiError(error));
    }

    const text = response.text ?? "";
    return parseExtractedResponse(text);
  }

  private async assertNotCancelled() {
    if (this.shouldCancel && (await this.shouldCancel())) {
      throw new Error("Ingestion cancelled by user.");
    }
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

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          temperature: 0.1,
          maxOutputTokens: 16384,
        },
      });
    } catch (error: any) {
      throw new Error(formatGeminiError(error));
    }

    const text = response.text ?? "";
    return parseExtractedResponse(text);
  }
}

function formatGeminiError(error: any) {
  const raw = String(error?.message ?? error);
  if (/RESOURCE_EXHAUSTED|quota exceeded/i.test(raw)) {
    return "Gemini quota exceeded for the selected model/API key. Wait for quota reset, enable billing, or choose another Document AI provider/model.";
  }
  if (/INVALID_ARGUMENT|invalid argument/i.test(raw)) {
    return "Gemini rejected the PDF request. Check that the PDF is under 50 MB, the model supports PDFs, and the file is not corrupt.";
  }
  return raw;
}

async function tryNativePdfExtraction(buffer: Buffer) {
  try {
    const { extractPdf } = await import("./pdf-extractor");
    return await extractPdf(buffer);
  } catch {
    return null;
  }
}

async function createPdfSlice(
  sourcePdf: import("pdf-lib").PDFDocument,
  startPageIndex: number,
  endPageIndex: number
): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const targetPdf = await PDFDocument.create();
  const pageIndexes = Array.from(
    { length: endPageIndex - startPageIndex },
    (_, index) => startPageIndex + index
  );
  const copiedPages = await targetPdf.copyPages(sourcePdf, pageIndexes);
  for (const page of copiedPages) {
    targetPdf.addPage(page);
  }
  return Buffer.from(await targetPdf.save());
}

function makeBatchPrompt(startPageNumber: number, endPageIndex: number) {
  const endPageNumber = endPageIndex;
  return `${EXTRACT_PROMPT}

This uploaded PDF is a slice of the original document. The first page in this uploaded PDF is original page ${startPageNumber}. The last page is original page ${endPageNumber}. Use original page numbers ${startPageNumber}-${endPageNumber} in the JSON pageNumber fields.`;
}

function normalizeBatchPageNumber(
  pageNumber: number,
  pageOffset: number,
  batchPageCount: number
) {
  if (pageOffset > 0 && pageNumber >= 1 && pageNumber <= batchPageCount) {
    return pageNumber + pageOffset;
  }
  return pageNumber;
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
