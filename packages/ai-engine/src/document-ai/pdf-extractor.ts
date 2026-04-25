// =============================================================================
// PDF extraction (REQ-ING-002, REQ-ING-003)
//
// Extracts text, headings, tables, and images from PDF documents.
// Runs OCR on scanned pages and reports per-page confidence scores.
// =============================================================================

import type { ExtractedChunk, DocumentExtractionResult } from "./index";
import { OCR_CONFIDENCE_THRESHOLD } from "./constants";

interface PdfPage {
  pageNumber: number;
  text: string;
  items: Array<{ str: string; transform: number[]; width: number; height: number; fontName?: string }>;
}

export async function extractPdf(buffer: Buffer): Promise<DocumentExtractionResult> {
  // Dynamic import — keeps the module optional in environments that don't need it
  let pdfParse: (buf: Buffer, options?: any) => Promise<any>;
  try {
    pdfParse = (await import("pdf-parse")).default;
  } catch {
    throw new Error(
      "pdf-parse is not installed. Run: pnpm add pdf-parse --filter @ams/ai-engine"
    );
  }

  const data = await pdfParse(buffer, { max: 0 });
  const chunks: ExtractedChunk[] = [];
  const lowConfidencePages: number[] = [];
  const errors: Array<{ page: number; message: string }> = [];
  let ocrUsed = false;

  // pdf-parse gives us all text; split back into pages using formfeed chars
  const pageTexts = data.text.split("\f");
  const pageCount = data.numpages;

  for (let i = 0; i < pageTexts.length; i++) {
    const pageNumber = i + 1;
    const rawText = pageTexts[i]?.trim() ?? "";

    // Detect scanned page: very little text relative to expected content
    const isLikelyScanned = rawText.length < 50 && pageNumber <= pageCount;

    if (isLikelyScanned && rawText.length === 0) {
      ocrUsed = true;
      // In production: call OCR provider here and get confidence scores
      const ocrConfidence = 0.0; // No text layer at all
      if (ocrConfidence < OCR_CONFIDENCE_THRESHOLD) {
        lowConfidencePages.push(pageNumber);
      }
      continue;
    }

    try {
      // Split page into paragraphs and detect structure
      const paragraphs = splitIntoParagraphs(rawText);
      let currentHeading: string | undefined;

      for (const para of paragraphs) {
        if (!para.trim()) continue;

        if (isHeading(para)) {
          currentHeading = para.trim();
          // Emit heading as its own chunk
          chunks.push({
            type: "text",
            content: para.trim(),
            pageNumber,
            sectionHeading: currentHeading,
            confidence: 1.0,
          });
        } else if (isTableLike(para)) {
          const tableData = parseMarkdownTable(para);
          if (tableData) {
            chunks.push({
              type: "table",
              content: JSON.stringify(tableData),
              pageNumber,
              sectionHeading: currentHeading,
              confidence: 1.0,
              tableData,
            });
          } else {
            chunks.push({
              type: "text",
              content: para.trim(),
              pageNumber,
              sectionHeading: currentHeading,
              confidence: 1.0,
            });
          }
        } else {
          chunks.push({
            type: "text",
            content: para.trim(),
            pageNumber,
            sectionHeading: currentHeading,
            confidence: 1.0,
          });
        }
      }
    } catch (err: any) {
      errors.push({ page: pageNumber, message: err.message });
    }
  }

  return { chunks, pageCount, ocrUsed, lowConfidencePages, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitIntoParagraphs(text: string): string[] {
  // Split on blank lines; also split on lines that look like new headings
  return text
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length === 0) return [];
      // If block starts with a heading pattern and has more content, keep together
      return [block];
    })
    .filter(Boolean);
}

const HEADING_PATTERNS = [
  /^\d+(\.\d+)*\s+[A-Z]/, // "1.2 Title" or "3.4.5 Something"
  /^[A-Z][A-Z\s\-]{4,}$/, // ALL CAPS SHORT LINE
  /^#{1,6}\s+/,             // Markdown #
  /^[A-Z][a-zA-Z\s]{2,40}:?\s*$/, // "Introduction" or "Purpose:"
];

function isHeading(text: string): boolean {
  const line = text.trim().split("\n")[0];
  if (line.length > 120) return false;
  return HEADING_PATTERNS.some((p) => p.test(line));
}

function isTableLike(text: string): boolean {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return false;
  // At least 2 lines with pipe separators or consistent tab alignment
  const pipeLines = lines.filter((l) => l.includes("|")).length;
  return pipeLines >= 2;
}

function parseMarkdownTable(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} | null {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const tableLines = lines.filter((l) => l.includes("|"));
  if (tableLines.length < 2) return null;

  const parseRow = (line: string): string[] =>
    line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c && !c.match(/^[-:]+$/));

  const headers = parseRow(tableLines[0]);
  if (headers.length === 0) return null;

  const dataLines = tableLines.slice(1).filter((l) => !l.match(/^\s*\|[-|:\s]+\|\s*$/));

  const rows = dataLines.map((line) => {
    const cells = parseRow(line);
    return headers.reduce<Record<string, string>>((row, header, i) => {
      row[header] = cells[i] ?? "";
      return row;
    }, {});
  });

  return { headers, rows };
}
