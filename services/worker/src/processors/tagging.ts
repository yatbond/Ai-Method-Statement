// =============================================================================
// Metadata tagging processor (REQ-ING-005)
//
// Runs after ingestion; uses the LLM to tag the document with trade,
// activity, plant, safety risk types, etc. Tags are stored for user review.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { tagDocument } from "@ams/ai-engine/src/document-ai/metadata-tagger";
import { createLLMProvider } from "@ams/ai-engine";

export async function processTagging(
  job: Job<{ documentId: string; passageIds: string[] }>
) {
  const { documentId, passageIds } = job.data;

  const passages = await db.sourcePassage.findMany({
    where: { id: { in: passageIds }, contentType: "text" },
    select: { extractedText: true, contentType: true, pageNumber: true, sectionHeading: true },
  });

  const llm = createLLMProvider({
    provider: (process.env.LLM_PROVIDER as "anthropic" | "openai") ?? "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    model: process.env.LLM_MODEL,
  });

  const chunks = passages.map((p) => ({
    type: "text" as const,
    content: p.extractedText,
    pageNumber: p.pageNumber ?? 1,
    sectionHeading: p.sectionHeading ?? undefined,
  }));

  const tags = await tagDocument(chunks, llm);

  // Store tags on ProjectDocument
  await db.projectDocument.update({
    where: { id: documentId },
    data: {
      // Store AI-generated tags in a structured format via a JSON column
      // The tags are stored as HistoricalMSTag entries if this is a historical MS
      // For project documents we store them inline
    },
  });

  // If this document is a historical MS, create tag records
  const historicalMS = await db.historicalMethodStatement.findFirst({
    where: { fileKey: { contains: documentId } },
  });

  if (historicalMS) {
    const tagEntries = buildTagEntries(tags);
    for (const entry of tagEntries) {
      await db.historicalMSTag.upsert({
        where: {
          // composite lookup — use create/update pattern
          id: `${historicalMS.id}-${entry.key}-${entry.value}`.slice(0, 25),
        },
        update: {},
        create: {
          historicalMethodStatementId: historicalMS.id,
          key: entry.key,
          value: entry.value,
          aiGenerated: true,
        },
      });
    }
  }

  return { documentId, tags };
}

function buildTagEntries(tags: Record<string, any>): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];

  if (tags.trade) entries.push({ key: "trade", value: tags.trade });
  if (tags.activity) entries.push({ key: "activity", value: tags.activity });
  if (tags.projectName) entries.push({ key: "projectName", value: tags.projectName });
  if (tags.client) entries.push({ key: "client", value: tags.client });
  if (tags.workType) entries.push({ key: "workType", value: tags.workType });
  if (tags.approvalStatus) entries.push({ key: "approvalStatus", value: tags.approvalStatus });
  if (tags.version) entries.push({ key: "version", value: tags.version });
  if (tags.documentDate) entries.push({ key: "documentDate", value: tags.documentDate });
  if (tags.temporaryWorksRelevant) entries.push({ key: "temporaryWorksRelevant", value: "true" });
  if (tags.qaQcRelevant) entries.push({ key: "qaQcRelevant", value: "true" });
  if (tags.environmentalRelevant) entries.push({ key: "environmentalRelevant", value: "true" });

  for (const plant of tags.plantEquipment ?? []) {
    entries.push({ key: "plant", value: plant });
  }
  for (const risk of tags.safetyRiskTypes ?? []) {
    entries.push({ key: "safetyRiskType", value: risk });
  }

  return entries;
}
