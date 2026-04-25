// =============================================================================
// DOCX extraction (REQ-ING-001, REQ-ING-002)
//
// Extracts text, headings, and tables from Word documents using mammoth.
// All tables are returned as structured rows.
// =============================================================================

import type { ExtractedChunk, DocumentExtractionResult } from "./index";

export async function extractDocx(buffer: Buffer): Promise<DocumentExtractionResult> {
  let mammoth: any;
  try {
    mammoth = await import("mammoth");
  } catch {
    throw new Error(
      "mammoth is not installed. Run: pnpm add mammoth --filter @ams/ai-engine"
    );
  }

  const chunks: ExtractedChunk[] = [];
  const errors: Array<{ page: number; message: string }> = [];

  // Extract raw HTML to preserve structure
  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
      ],
    }
  );

  for (const msg of messages) {
    if (msg.type === "error") {
      errors.push({ page: 0, message: msg.message });
    }
  }

  // Parse HTML to extract structured content
  const parsed = parseHtmlContent(html);
  chunks.push(...parsed);

  return {
    chunks,
    pageCount: estimatePageCount(chunks),
    ocrUsed: false,
    lowConfidencePages: [],
    errors,
  };
}

interface ParsedNode {
  type: "heading" | "paragraph" | "table";
  level?: number;
  content: string;
  tableData?: { headers: string[]; rows: Record<string, string>[] };
}

function parseHtmlContent(html: string): ExtractedChunk[] {
  const chunks: ExtractedChunk[] = [];
  let currentHeading: string | undefined;
  // Rough page number estimation: every ~3000 chars ≈ 1 page
  let charCount = 0;
  let pageNumber = 1;

  const nodes = tokeniseHtml(html);

  for (const node of nodes) {
    charCount += node.content.length;
    pageNumber = Math.max(1, Math.ceil(charCount / 3000));

    if (node.type === "heading") {
      currentHeading = stripHtml(node.content);
      chunks.push({
        type: "text",
        content: currentHeading,
        pageNumber,
        sectionHeading: currentHeading,
        confidence: 1.0,
      });
    } else if (node.type === "table" && node.tableData) {
      chunks.push({
        type: "table",
        content: JSON.stringify(node.tableData),
        pageNumber,
        sectionHeading: currentHeading,
        confidence: 1.0,
        tableData: node.tableData,
      });
    } else if (node.type === "paragraph" && node.content.trim()) {
      chunks.push({
        type: "text",
        content: stripHtml(node.content).trim(),
        pageNumber,
        sectionHeading: currentHeading,
        confidence: 1.0,
      });
    }
  }

  return chunks;
}

function tokeniseHtml(html: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];

  // Extract tables first (they contain complex HTML)
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const parts = html.split(tableRegex);
  const tables = html.match(tableRegex) ?? [];

  let tableIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Process heading tags
    const headingRegex = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(part)) !== null) {
      const before = part.slice(lastIndex, match.index);
      if (before.trim()) {
        nodes.push(...extractParagraphs(before));
      }
      nodes.push({ type: "heading", content: match[2], level: parseInt(match[1][1]) });
      lastIndex = match.index + match[0].length;
    }

    const remaining = part.slice(lastIndex);
    if (remaining.trim()) {
      nodes.push(...extractParagraphs(remaining));
    }

    // Insert table after this part
    if (tableIndex < tables.length) {
      const tableData = parseHtmlTable(tables[tableIndex]);
      if (tableData) {
        nodes.push({
          type: "table",
          content: JSON.stringify(tableData),
          tableData,
        });
      }
      tableIndex++;
    }
  }

  return nodes;
}

function extractParagraphs(html: string): ParsedNode[] {
  const paras: ParsedNode[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text) paras.push({ type: "paragraph", content: match[1] });
  }

  return paras;
}

function parseHtmlTable(tableHtml: string): {
  headers: string[];
  rows: Record<string, string>[];
} | null {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    const cellRe = new RegExp(cellRegex.source, "gi");
    while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
      cells.push(stripHtml(cellMatch[1]).trim());
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  const headers = rows[0];
  const dataRows = rows.slice(1).map((cells) =>
    headers.reduce<Record<string, string>>((row, header, i) => {
      row[header] = cells[i] ?? "";
      return row;
    }, {})
  );

  return { headers, rows: dataRows };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function estimatePageCount(chunks: ExtractedChunk[]): number {
  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
  return Math.max(1, Math.ceil(totalChars / 3000));
}
