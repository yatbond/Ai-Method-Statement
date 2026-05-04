// =============================================================================
// Z.ai GLM-OCR Document AI provider
//
// Uses the Z.ai layout parsing API for direct PDF/image OCR. PDFs always go
// through Z.ai so tables, diagrams, and layout are preserved even when the PDF
// has a selectable text layer.
// =============================================================================

import type {
  DocumentAIBatchResult,
  DocumentAIProgress,
  DocumentExtractionResult,
  ExtractedChunk,
} from "./index";

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const ZAI_PDF_LIMIT_BYTES = 50 * 1024 * 1024;
const ZAI_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
const ZAI_MAX_PAGES_PER_REQUEST = 100;
const DEFAULT_BATCH_PAGE_COUNT = 10;
const DEFAULT_REQUEST_DELAY_MS = 120000;
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

let lastZaiRequestAt = 0;
let zaiRequestSlotQueue: Promise<void> = Promise.resolve();
let zaiCooldownUntil = 0;

type ZaiLayoutElement = {
  index?: number;
  label?: string;
  content?: string;
  bbox_2d?: number[];
  height?: number;
  width?: number;
};

type ZaiLayoutParsingResponse = {
  id?: string;
  model?: string;
  md_results?: string;
  layout_details?: ZaiLayoutElement[][];
  data_info?: {
    num_pages?: number;
    pages?: Array<{ width?: number; height?: number }>;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  request_id?: string;
  error?: { message?: string; code?: string };
  msg?: string;
  message?: string;
};

export class ZaiDocumentAIProvider {
  readonly provider = "zai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly shouldCancel?: () => Promise<boolean>;
  private readonly onProgress?: (progress: DocumentAIProgress) => Promise<void>;
  private readonly onBatchComplete?: (batch: DocumentAIBatchResult) => Promise<void>;
  private readonly completedPageIndexes: Set<number>;

  constructor(
    apiKey: string,
    model = "glm-ocr",
    baseURL = DEFAULT_BASE_URL,
    shouldCancel?: () => Promise<boolean>,
    onProgress?: (progress: DocumentAIProgress) => Promise<void>,
    onBatchComplete?: (batch: DocumentAIBatchResult) => Promise<void>,
    completedPageRanges?: Array<{ startPage: number; endPage: number }>
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL || DEFAULT_BASE_URL;
    this.shouldCancel = shouldCancel;
    this.onProgress = onProgress;
    this.onBatchComplete = onBatchComplete;
    this.completedPageIndexes = new Set(
      (completedPageRanges ?? []).flatMap((range) => {
        const start = Math.max(1, Math.floor(range.startPage));
        const end = Math.max(start, Math.floor(range.endPage));
        return Array.from({ length: end - start + 1 }, (_, index) => start + index - 1);
      })
    );
  }

  async extract(buffer: Buffer, mimeType: string): Promise<DocumentExtractionResult> {
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
      if (buffer.length > ZAI_IMAGE_LIMIT_BYTES) {
        throw new Error(
          `Z.ai GLM-OCR supports images up to 10 MB; this image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB.`
        );
      }
      const response = await this.callLayoutParsing(buffer, mimeType);
      return parseLayoutResponse(response, 0);
    }

    throw new Error(`Unsupported MIME type for Z.ai GLM-OCR extraction: ${mimeType}`);
  }

  private async extractPdf(buffer: Buffer): Promise<DocumentExtractionResult> {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    await this.reportProgress({ stage: "loaded-pdf", processedPages: 0, totalPages: pageCount });

    const batchPageCount = getZaiBatchPageCount();
    if (pageCount <= batchPageCount && buffer.length <= ZAI_PDF_LIMIT_BYTES) {
      if (this.isRangeComplete(0, pageCount)) {
        await this.reportProgress({
          stage: "zai-batch-skipped",
          processedPages: pageCount,
          totalPages: pageCount,
          batchStartPage: 1,
          batchEndPage: pageCount,
        });
        return { chunks: [], pageCount, ocrUsed: true, lowConfidencePages: [], errors: [] };
      }
      const response = await this.callLayoutParsing(buffer, "application/pdf");
      const result = { ...parseLayoutResponse(response, 0), pageCount };
      await this.reportBatchComplete(0, pageCount, pageCount, result);
      return result;
    }

    return this.extractPdfInBatches(pdf, pageCount, batchPageCount);
  }

  private async extractPdfInBatches(
    pdf: import("pdf-lib").PDFDocument,
    pageCount: number,
    batchPageCount: number
  ): Promise<DocumentExtractionResult> {
    const chunks: ExtractedChunk[] = [];
    const lowConfidencePages: number[] = [];
    const errors: Array<{ page: number; message: string }> = [];

    let startPageIndex = 0;
    while (startPageIndex < pageCount) {
      await this.assertNotCancelled();

      const endPageIndex = Math.min(startPageIndex + batchPageCount, pageCount);
      await this.extractPdfRangeWithFallback({
        pdf,
        startPageIndex,
        endPageIndex,
        pageCount,
        chunks,
        lowConfidencePages,
        errors,
      });
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

  private async callLayoutParsing(
    buffer: Buffer,
    mimeType: string
  ): Promise<ZaiLayoutParsingResponse> {
    await this.assertNotCancelled();
    await waitForZaiRequestSlot(this.shouldCancel);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getZaiRequestTimeoutMs());

    let response: Response;
    try {
      response = await fetch(makeLayoutParsingUrl(this.baseURL), {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          file: `data:${mimeType};base64,${buffer.toString("base64")}`,
          return_crop_images: false,
          need_layout_visualization: false,
        }),
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error(`Z.ai GLM-OCR request timed out after ${Math.round(getZaiRequestTimeoutMs() / 1000)} seconds.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data: ZaiLayoutParsingResponse;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      applyZaiRateLimitCooldown(response.status, data);
      throw new Error(formatZaiError(response.status, data));
    }

    const businessError = data.error?.message ?? data.msg ?? data.message;
    if (businessError && !data.md_results && !data.layout_details) {
      applyZaiRateLimitCooldown(response.status, data);
      throw new Error(formatZaiError(response.status, data));
    }

    await this.assertNotCancelled();
    return data;
  }

  private async assertNotCancelled() {
    if (this.shouldCancel && (await this.shouldCancel())) {
      throw new Error("Ingestion cancelled by user.");
    }
  }

  private async reportProgress(progress: DocumentAIProgress) {
    if (this.onProgress) await this.onProgress(progress);
  }

  private async reportBatchComplete(
    startPageIndex: number,
    endPageIndex: number,
    totalPages: number,
    result: DocumentExtractionResult
  ) {
    if (this.onBatchComplete) {
      await this.onBatchComplete({
        batchStartPage: startPageIndex + 1,
        batchEndPage: endPageIndex,
        totalPages,
        chunks: result.chunks,
        lowConfidencePages: result.lowConfidencePages,
        errors: result.errors,
      });
    }

    for (let pageIndex = startPageIndex; pageIndex < endPageIndex; pageIndex += 1) {
      this.completedPageIndexes.add(pageIndex);
    }
  }

  private isRangeComplete(startPageIndex: number, endPageIndex: number) {
    for (let pageIndex = startPageIndex; pageIndex < endPageIndex; pageIndex += 1) {
      if (!this.completedPageIndexes.has(pageIndex)) return false;
    }
    return true;
  }

  private getMissingRanges(startPageIndex: number, endPageIndex: number) {
    const ranges: Array<{ startPageIndex: number; endPageIndex: number }> = [];
    let rangeStart: number | null = null;

    for (let pageIndex = startPageIndex; pageIndex < endPageIndex; pageIndex += 1) {
      if (this.completedPageIndexes.has(pageIndex)) {
        if (rangeStart !== null) {
          ranges.push({ startPageIndex: rangeStart, endPageIndex: pageIndex });
          rangeStart = null;
        }
      } else if (rangeStart === null) {
        rangeStart = pageIndex;
      }
    }

    if (rangeStart !== null) {
      ranges.push({ startPageIndex: rangeStart, endPageIndex });
    }
    return ranges;
  }

  private async extractPdfRangeWithFallback(options: {
    pdf: import("pdf-lib").PDFDocument;
    startPageIndex: number;
    endPageIndex: number;
    pageCount: number;
    chunks: ExtractedChunk[];
    lowConfidencePages: number[];
    errors: Array<{ page: number; message: string }>;
  }): Promise<void> {
    const {
      pdf,
      startPageIndex,
      endPageIndex,
      pageCount,
      chunks,
      lowConfidencePages,
      errors,
    } = options;

    const missingRanges = this.getMissingRanges(startPageIndex, endPageIndex);
    if (missingRanges.length === 0) {
      await this.reportProgress({
        stage: "zai-batch-skipped",
        processedPages: endPageIndex,
        totalPages: pageCount,
        batchStartPage: startPageIndex + 1,
        batchEndPage: endPageIndex,
      });
      return;
    }
    if (
      missingRanges.length > 1 ||
      missingRanges[0].startPageIndex !== startPageIndex ||
      missingRanges[0].endPageIndex !== endPageIndex
    ) {
      for (const range of missingRanges) {
        await this.extractPdfRangeWithFallback({
          ...options,
          startPageIndex: range.startPageIndex,
          endPageIndex: range.endPageIndex,
        });
      }
      return;
    }

    let actualEndPageIndex = endPageIndex;
    let slice = await createPdfSlice(pdf, startPageIndex, actualEndPageIndex);

    while (slice.length > ZAI_PDF_LIMIT_BYTES && actualEndPageIndex - startPageIndex > 1) {
      actualEndPageIndex = startPageIndex + Math.ceil((actualEndPageIndex - startPageIndex) / 2);
      slice = await createPdfSlice(pdf, startPageIndex, actualEndPageIndex);
    }

    if (slice.length > ZAI_PDF_LIMIT_BYTES) {
      throw new Error(
        `Z.ai GLM-OCR supports PDFs up to 50 MB per request; page ${startPageIndex + 1} alone is ${(slice.length / 1024 / 1024).toFixed(1)} MB. Split or compress this PDF before ingestion.`
      );
    }

    await this.reportProgress({
      stage: "zai-batch-start",
      processedPages: startPageIndex,
      totalPages: pageCount,
      batchStartPage: startPageIndex + 1,
      batchEndPage: actualEndPageIndex,
    });
    console.log(
      `[zai] OCR pages ${startPageIndex + 1}-${actualEndPageIndex}/${pageCount} (${(slice.length / 1024 / 1024).toFixed(1)} MB)`
    );

    try {
      const response = await this.callLayoutParsing(slice, "application/pdf");
      const result = parseLayoutResponse(response, startPageIndex);
      chunks.push(...result.chunks);
      lowConfidencePages.push(...result.lowConfidencePages);
      errors.push(...result.errors);
      await this.reportBatchComplete(startPageIndex, actualEndPageIndex, pageCount, result);
      await this.reportProgress({
        stage: "zai-batch-complete",
        processedPages: actualEndPageIndex,
        totalPages: pageCount,
        batchStartPage: startPageIndex + 1,
        batchEndPage: actualEndPageIndex,
      });
    } catch (error: any) {
      const pageSpan = actualEndPageIndex - startPageIndex;
      if (pageSpan <= 1 || !shouldSplitZaiBatchOnError(error)) {
        throw error;
      }

      const midpoint = startPageIndex + Math.ceil(pageSpan / 2);
      console.warn(
        `[zai] OCR pages ${startPageIndex + 1}-${actualEndPageIndex}/${pageCount} failed (${formatErrorMessage(error)}); retrying as ${startPageIndex + 1}-${midpoint} and ${midpoint + 1}-${actualEndPageIndex}`
      );
      await this.extractPdfRangeWithFallback({
        ...options,
        startPageIndex,
        endPageIndex: midpoint,
      });
      await this.extractPdfRangeWithFallback({
        ...options,
        startPageIndex: midpoint,
        endPageIndex: actualEndPageIndex,
      });
    }

    if (actualEndPageIndex < endPageIndex) {
      await this.extractPdfRangeWithFallback({
        ...options,
        startPageIndex: actualEndPageIndex,
        endPageIndex,
      });
    }
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

function parseLayoutResponse(
  response: ZaiLayoutParsingResponse,
  pageOffset: number
): DocumentExtractionResult {
  const chunks: ExtractedChunk[] = [];
  const layoutPages = response.layout_details ?? [];

  for (let pageIndex = 0; pageIndex < layoutPages.length; pageIndex += 1) {
    const pageNumber = pageOffset + pageIndex + 1;
    for (const element of layoutPages[pageIndex] ?? []) {
      const content = String(element.content ?? "").trim();
      if (!content) continue;

      const type = mapLayoutLabel(element.label);
      chunks.push({
        type,
        content,
        pageNumber,
        confidence: 0.95,
        tableData: type === "table" ? tableDataFromHtml(content) : undefined,
        boundingBox: boundingBoxFromNormalized(element.bbox_2d),
      });
    }
  }

  if (chunks.length === 0 && response.md_results?.trim()) {
    chunks.push({
      type: "text",
      content: response.md_results.trim(),
      pageNumber: pageOffset + 1,
      confidence: 0.9,
    });
  }

  return {
    chunks,
    pageCount: response.data_info?.num_pages ?? Math.max(...chunks.map((chunk) => chunk.pageNumber - pageOffset), 1),
    ocrUsed: true,
    lowConfidencePages: [],
    errors: [],
  };
}

function mapLayoutLabel(label: string | undefined): ExtractedChunk["type"] {
  const normalized = String(label ?? "").toLowerCase();
  if (normalized === "table") return "table";
  if (normalized === "image") return "image";
  if (normalized === "formula") return "text";
  return "text";
}

function tableDataFromHtml(content: string) {
  return {
    headers: ["content"],
    rows: [{ content }],
  };
}

function boundingBoxFromNormalized(bbox: number[] | undefined) {
  if (!bbox || bbox.length !== 4) return undefined;
  const [x1, y1, x2, y2] = bbox;
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function makeLayoutParsingUrl(baseURL: string) {
  const trimmed = baseURL.replace(/\/+$/, "");
  if (/\/layout_parsing$/i.test(trimmed)) return trimmed;
  return `${trimmed}/layout_parsing`;
}

function getZaiBatchPageCount() {
  const configured = parseInt(
    process.env.DOCUMENT_AI_BATCH_PAGES ??
      process.env.ZAI_OCR_BATCH_PAGES ??
      String(DEFAULT_BATCH_PAGE_COUNT),
    10
  );
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_BATCH_PAGE_COUNT;
  return Math.min(configured, ZAI_MAX_PAGES_PER_REQUEST);
}

function getZaiRequestTimeoutMs() {
  const configured = parseInt(
    process.env.DOCUMENT_AI_REQUEST_TIMEOUT_MS ??
      process.env.ZAI_OCR_REQUEST_TIMEOUT_MS ??
      String(DEFAULT_REQUEST_TIMEOUT_MS),
    10
  );
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return configured;
}

function shouldSplitZaiBatchOnError(error: any) {
  return /fetch failed|failed to read request body|request body|terminated|socket|ECONN|ETIMEDOUT|timed out|network/i.test(
    formatErrorMessage(error)
  );
}

function formatErrorMessage(error: any) {
  return String(error?.message ?? error);
}

async function waitForZaiRequestSlot(shouldCancel?: () => Promise<boolean>) {
  const waitForSlot = zaiRequestSlotQueue.then(async () => {
    const delayMs = getZaiRequestDelayMs();
    const elapsed = Date.now() - lastZaiRequestAt;
    const delayWaitMs = delayMs > 0 ? Math.max(0, delayMs - elapsed) : 0;
    const cooldownWaitMs = Math.max(0, zaiCooldownUntil - Date.now());
    const waitMs = Math.max(delayWaitMs, cooldownWaitMs);

    if (waitMs > 0) {
      const endAt = Date.now() + waitMs;
      while (Date.now() < endAt) {
        if (shouldCancel && (await shouldCancel())) {
          throw new Error("Ingestion cancelled by user.");
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, endAt - Date.now())));
      }
    }

    lastZaiRequestAt = Date.now();
  });

  zaiRequestSlotQueue = waitForSlot.catch(() => undefined);
  return waitForSlot;
}

function getZaiRequestDelayMs() {
  const configured = parseInt(
    process.env.DOCUMENT_AI_REQUEST_DELAY_MS ??
      process.env.ZAI_OCR_REQUEST_DELAY_MS ??
      String(DEFAULT_REQUEST_DELAY_MS),
    10
  );
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  return configured;
}

function getZaiRateLimitCooldownMs() {
  const configured = parseInt(
    process.env.ZAI_OCR_RATE_LIMIT_COOLDOWN_MS ??
      process.env.DOCUMENT_AI_RATE_LIMIT_COOLDOWN_MS ??
      String(DEFAULT_RATE_LIMIT_COOLDOWN_MS),
    10
  );
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return configured;
}

function applyZaiRateLimitCooldown(status: number, data: ZaiLayoutParsingResponse) {
  const message = data.error?.message ?? data.msg ?? data.message ?? "";
  if (status === 429 || /quota|rate limit|insufficient/i.test(message)) {
    const cooldownMs = getZaiRateLimitCooldownMs();
    zaiCooldownUntil = Math.max(zaiCooldownUntil, Date.now() + cooldownMs);
    console.warn(`[zai] Rate limit detected; cooling down OCR requests for ${Math.round(cooldownMs / 1000)}s`);
  }
}

function formatZaiError(status: number, data: ZaiLayoutParsingResponse) {
  const message = data.error?.message ?? data.msg ?? data.message ?? "Unknown Z.ai GLM-OCR error";
  if (status === 401 || status === 403) {
    return "Z.ai GLM-OCR rejected the API key. Check DOCUMENT_AI_API_KEY in Settings.";
  }
  if (status === 413 || /50\s*MB|100 pages|too large|maximum/i.test(message)) {
    return `Z.ai GLM-OCR rejected the document size: ${message}`;
  }
  if (status === 429 || /quota|rate limit|insufficient/i.test(message)) {
    return `Z.ai GLM-OCR quota or rate limit reached: ${message}`;
  }
  return `Z.ai GLM-OCR request failed (${status}): ${message}`;
}
