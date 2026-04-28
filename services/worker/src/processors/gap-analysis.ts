// =============================================================================
// Gap analysis processor (REQ-GAP-001 to REQ-GAP-005)
//
// Triggered after retrieval completes or manually via the API.
// Gathers Pool A (project documents) and Pool B (retrieved precedents),
// runs the gap detection engine, and upserts GapItem records.
// Already-confirmed items are never overwritten.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { detectGaps, type PassageContext, createLLMProvider, getLLMConfigFromEnv } from "@ams/ai-engine";
import { CostTrackingLLMProvider } from "../lib/cost-tracking";

export async function processGapAnalysis(
  job: Job<{ methodStatementId: string }>
) {
  const { methodStatementId } = job.data;

  await db.workerJob.updateMany({
    where: {
      jobType: "gap-analysis.run",
      payload: { path: ["methodStatementId"], equals: methodStatementId },
    },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const ms = await db.methodStatement.findUniqueOrThrow({
      where: { id: methodStatementId },
      include: {
        trade: { select: { name: true } },
        activity: { select: { name: true } },
        project: { select: { id: true } },
        gapItems: {
          where: {
            status: {
              in: ["CONFIRMED_BY_DOCUMENT", "CONFIRMED_BY_USER", "NOT_APPLICABLE"],
            },
          },
          select: { category: true, question: true, answer: true },
        },
      },
    });

    await job.updateProgress(10);

    // Pool A: project document passages ordered by authority rank (highest first)
    const projectPassages = await db.sourcePassage.findMany({
      where: {
        sourceDocument: { projectId: ms.project.id },
        contentType: { in: ["text", "table"] },
      },
      orderBy: [
        { sourceDocument: { authorityRank: "asc" } },
        { pageNumber: "asc" },
      ],
      take: 100,
      select: {
        id: true,
        extractedText: true,
        contentType: true,
        sectionHeading: true,
        pageNumber: true,
        sourceDocument: {
          select: {
            title: true,
            authorityRank: true,
          },
        },
      },
    });

    await job.updateProgress(30);

    // Pool B: included retrieval results (user hasn't excluded them)
    const retrievalResults = await db.retrievalResult.findMany({
      where: { methodStatementId, excluded: false },
      include: {
        historicalMethodStatement: {
          select: {
            title: true,
            sourcePassages: {
              where: { contentType: { in: ["text", "table"] } },
              take: 5,
              select: { id: true, extractedText: true, contentType: true, sectionHeading: true },
            },
          },
        },
      },
    });

    await job.updateProgress(50);

    const poolA: PassageContext[] = projectPassages.map((p) => ({
      passageId: p.id,
      content: p.extractedText,
      contentType: p.contentType,
      sectionHeading: p.sectionHeading,
      pageNumber: p.pageNumber,
      authorityRank: p.sourceDocument?.authorityRank,
      sourceDocumentTitle: p.sourceDocument?.title ?? undefined,
    }));

    const poolB: PassageContext[] = retrievalResults.flatMap((r) =>
      r.historicalMethodStatement.sourcePassages.map((p) => ({
        passageId: p.id,
        content: p.extractedText,
        contentType: p.contentType,
        sectionHeading: p.sectionHeading ?? undefined,
        historicalMSTitle: r.historicalMethodStatement.title,
      }))
    );

    const llm = new CostTrackingLLMProvider(
      createLLMProvider(getLLMConfigFromEnv()),
      { operation: "gap-analysis", methodStatementId, projectId: ms.project.id }
    );

    const gaps = await detectGaps(
      {
        methodStatementId,
        trade: ms.trade.name,
        activity: ms.activity?.name,
        title: ms.title,
        existingConfirmedAnswers: ms.gapItems.map((g) => ({
          category: g.category,
          question: g.question,
          answer: g.answer ?? "",
        })),
        projectDocPassages: poolA,
        precedentPassages: poolB,
      },
      llm
    );

    await job.updateProgress(80);

    // Upsert gap items — skip categories that are already confirmed
    const confirmedCategories = new Set(
      ms.gapItems.map((g) => `${g.category}::${g.question}`)
    );

    let created = 0;
    for (const gap of gaps) {
      const key = `${gap.category}::${gap.question}`;
      if (confirmedCategories.has(key)) continue;

      // Upsert by methodStatementId + category + question fingerprint
      const existing = await db.gapItem.findFirst({
        where: { methodStatementId, category: gap.category, question: gap.question },
        select: { id: true, status: true },
      });

      if (existing) {
        // Only update if the existing item is still unresolved
        if (
          existing.status === "TO_BE_CONFIRMED" ||
          existing.status === "MISSING" ||
          existing.status === "SUGGESTED_FROM_PRECEDENT"
        ) {
          await db.gapItem.update({
            where: { id: existing.id },
            data: {
              status: gap.status,
              answer: gap.answer ?? null,
              sourceDocumentRef: gap.sourceDocumentRef ?? null,
            },
          });
        }
      } else {
        await db.gapItem.create({
          data: {
            methodStatementId,
            category: gap.category,
            question: gap.question,
            status: gap.status,
            answer: gap.answer ?? null,
            sourceDocumentRef: gap.sourceDocumentRef ?? null,
          },
        });
        created++;
      }
    }

    await job.updateProgress(100);

    await db.workerJob.updateMany({
      where: {
        jobType: "gap-analysis.run",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        result: { gapCount: gaps.length, created },
      },
    });

    return { methodStatementId, gapCount: gaps.length, created };
  } catch (error: any) {
    await db.workerJob.updateMany({
      where: {
        jobType: "gap-analysis.run",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
