// =============================================================================
// Word Document Exporter (REQ-EXPORT, Phase 8)
//
// Generates a .docx method statement from section content, appendices,
// and reference lists.
//
// CRITICAL: REQ-SIGN-001 — NO AI-generated label or watermark on output.
// REQ-SIGN-003 — Human sign-off is the only approval path.
// Tables are rendered as proper Word tables (never flattened to images).
// =============================================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableOfContents,
  LevelFormat,
  convertInchesToTwip,
} from "docx";

export interface SectionForExport {
  sectionKey: string;
  sectionTitle: string;
  orderIndex: number;
  content: string;
}

export interface ReferenceForExport {
  indexNumber: number;
  pool: "A" | "B";
  sourceTitle: string;
  sourceRef?: string | null;
  excerpt?: string | null;
}

export interface ExportInput {
  methodStatementTitle: string;
  trade: string;
  activity?: string;
  projectName?: string;
  client?: string;
  sections: SectionForExport[];
  references: ReferenceForExport[];
  unresolvedGaps: Array<{ category: string; question: string }>;
  unresolvedConflicts: Array<{ topic: string; currentRequirement: string; conflictingContent: string }>;
  exportOptions: {
    appendixAIncluded: boolean;
    appendixBIncluded: boolean;
    includeUnresolvedItemsAppendix: boolean;
  };
  exportedBy: string;
  exportedAt: Date;
}

function parseMarkdownParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    // Headings
    const h2Match = trimmed.match(/^## (.+)/);
    const h3Match = trimmed.match(/^### (.+)/);
    if (h2Match) {
      paragraphs.push(new Paragraph({ text: h2Match[1], heading: HeadingLevel.HEADING_2 }));
      continue;
    }
    if (h3Match) {
      paragraphs.push(new Paragraph({ text: h3Match[1], heading: HeadingLevel.HEADING_3 }));
      continue;
    }

    // Bullet lists
    const bulletMatch = trimmed.match(/^[-*] (.+)/);
    if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(stripGapSrcMarkers(bulletMatch[1]))],
          bullet: { level: 0 },
        })
      );
      continue;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^\d+\. (.+)/);
    if (numMatch) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(stripGapSrcMarkers(numMatch[1]))],
          numbering: { reference: "default-numbering", level: 0 },
        })
      );
      continue;
    }

    // Gap markers highlighted in text
    const gapHighlighted = trimmed.replace(
      /\[GAP:\s*([^\]]+)\]/g,
      "⚠ [GAP: $1]"
    );

    paragraphs.push(
      new Paragraph({
        children: [new TextRun(stripSrcMarkers(gapHighlighted))],
      })
    );
  }

  return paragraphs;
}

function parseMarkdownTable(markdown: string): Table | null {
  const lines = markdown.trim().split("\n");
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return null;

  const parseRow = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(tableLines[0]);
  const rows = tableLines.slice(2).map(parseRow); // skip separator row

  return new Table({
    width: { size: 100, type: "pct" as any },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true })],
                }),
              ],
              shading: { fill: "F3F4F6" } as any,
            })
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map(
              (_h, i) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun(row[i] ?? "")] })],
                })
            ),
          })
      ),
    ],
  });
}

function stripGapSrcMarkers(text: string): string {
  return text
    .replace(/\[SRC:[^\]]+\]/g, "")
    .replace(/\[GAP:\s*([^\]]+)\]/g, "⚠ [GAP: $1]");
}

function stripSrcMarkers(text: string): string {
  return text.replace(/\[SRC:[^\]]+\]/g, "");
}

function sectionToChildren(content: string): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  // Split on markdown table blocks (lines starting with |)
  const parts = content.split(/((?:\|[^\n]+\n)+)/g);

  for (const part of parts) {
    if (part.trim().startsWith("|")) {
      const table = parseMarkdownTable(part);
      if (table) {
        children.push(table);
        continue;
      }
    }
    children.push(...parseMarkdownParagraphs(part));
  }

  return children;
}

export async function generateWordDocument(input: ExportInput): Promise<Buffer> {
  const sortedSections = [...input.sections].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  const poolBRefs = input.references.filter((r) => r.pool === "B");
  const poolARefs = input.references.filter((r) => r.pool === "A");

  const sections: any[] = [
    // Cover / Title Section
    {
      properties: {},
      children: [
        new Paragraph({
          text: input.methodStatementTitle,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: input.trade, size: 28, color: "4F46E5" })],
          alignment: AlignmentType.CENTER,
        }),
        ...(input.activity
          ? [
              new Paragraph({
                children: [new TextRun({ text: input.activity, size: 24, color: "6B7280" })],
                alignment: AlignmentType.CENTER,
              }),
            ]
          : []),
        new Paragraph({ children: [new PageBreak()] }),

        // Document control table
        new Paragraph({ text: "Document Control", heading: HeadingLevel.HEADING_1 }),
        new Table({
          width: { size: 100, type: "pct" as any },
          rows: [
            ...([
              ["Project", input.projectName ?? "[GAP: project name]"],
              ["Client", input.client ?? "[GAP: client name]"],
              ["Trade", input.trade],
              ["Exported by", input.exportedBy],
              ["Export date", input.exportedAt.toISOString().split("T")[0]],
              ["Status", "DRAFT — Requires human sign-off before submission (REQ-SIGN-003)"],
            ] as [string, string][]).map(
              ([label, value]) =>
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
                      shading: { fill: "F9FAFB" } as any,
                      width: { size: 30, type: "pct" as any },
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun(value)] })],
                    }),
                  ],
                })
            ),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // Body sections
        ...sortedSections.flatMap((sec) => [
          new Paragraph({ text: sec.sectionTitle, heading: HeadingLevel.HEADING_1 }),
          ...sectionToChildren(sec.content ?? ""),
          new Paragraph({ children: [new PageBreak()] }),
        ]),

        // Appendix A: Pool B (Project Documents)
        ...(input.exportOptions.appendixAIncluded && poolBRefs.length > 0
          ? [
              new Paragraph({ text: "Appendix A — Project Document References", heading: HeadingLevel.HEADING_1 }),
              new Table({
                width: { size: 100, type: "pct" as any },
                rows: [
                  new TableRow({
                    tableHeader: true,
                    children: ["Ref", "Document", "Page / Section", "Excerpt"].map(
                      (h) =>
                        new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                          shading: { fill: "F3F4F6" } as any,
                        })
                    ),
                  }),
                  ...poolBRefs.map(
                    (r) =>
                      new TableRow({
                        children: [
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(`[${r.indexNumber}]`)] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(r.sourceTitle)] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(r.sourceRef ?? "")] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun((r.excerpt ?? "").slice(0, 200))] })] }),
                        ],
                      })
                  ),
                ],
              }),
              new Paragraph({ children: [new PageBreak()] }),
            ]
          : []),

        // Appendix B: Pool A (Historical Precedents)
        ...(input.exportOptions.appendixBIncluded && poolARefs.length > 0
          ? [
              new Paragraph({ text: "Appendix B — Historical Precedent References", heading: HeadingLevel.HEADING_1 }),
              new Table({
                width: { size: 100, type: "pct" as any },
                rows: [
                  new TableRow({
                    tableHeader: true,
                    children: ["Ref", "Historical MS", "Page / Section", "Excerpt"].map(
                      (h) =>
                        new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                          shading: { fill: "F3F4F6" } as any,
                        })
                    ),
                  }),
                  ...poolARefs.map(
                    (r) =>
                      new TableRow({
                        children: [
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(`[${r.indexNumber}]`)] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(r.sourceTitle)] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun(r.sourceRef ?? "")] })] }),
                          new TableCell({ children: [new Paragraph({ children: [new TextRun((r.excerpt ?? "").slice(0, 200))] })] }),
                        ],
                      })
                  ),
                ],
              }),
              new Paragraph({ children: [new PageBreak()] }),
            ]
          : []),

        // Appendix C: Unresolved items (optional)
        ...(input.exportOptions.includeUnresolvedItemsAppendix &&
        (input.unresolvedGaps.length > 0 || input.unresolvedConflicts.length > 0)
          ? [
              new Paragraph({ text: "Appendix C — Unresolved Items", heading: HeadingLevel.HEADING_1 }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "The following items were unresolved at time of export and require engineer attention before submission.",
                    italics: true,
                    color: "DC2626",
                  }),
                ],
              }),
              ...(input.unresolvedGaps.length > 0
                ? [
                    new Paragraph({ text: "Unresolved Information Gaps", heading: HeadingLevel.HEADING_2 }),
                    ...input.unresolvedGaps.map(
                      (g) =>
                        new Paragraph({
                          children: [
                            new TextRun({ text: `${g.category.replace(/_/g, " ")}: `, bold: true }),
                            new TextRun(g.question),
                          ],
                          bullet: { level: 0 },
                        })
                    ),
                  ]
                : []),
              ...(input.unresolvedConflicts.length > 0
                ? [
                    new Paragraph({ text: "Unresolved Conflicts", heading: HeadingLevel.HEADING_2 }),
                    ...input.unresolvedConflicts.map(
                      (c) =>
                        new Paragraph({
                          children: [
                            new TextRun({ text: `${c.topic}: `, bold: true }),
                            new TextRun(`Project doc: "${c.currentRequirement}" vs Precedent: "${c.conflictingContent}"`),
                          ],
                          bullet: { level: 0 },
                        })
                    ),
                  ]
                : []),
            ]
          : []),
      ],
    },
  ];

  const doc = new Document({
    creator: "AI Method Statement Studio",
    title: input.methodStatementTitle,
    description: `Method statement for ${input.trade}`,
    sections,
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
  });

  return Packer.toBuffer(doc);
}
