// =============================================================================
// Conflict detection processor (REQ-CON-001 to REQ-CON-005)
//
// Compares project document content against retrieved precedents.
// Persists ConflictRecord rows; already-resolved conflicts are never overwritten.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { detectConflicts, type ConflictPassage } from "@ams/ai-engine";
import { AnthropicLLMProvider } from "@ams/ai-engine";
import { CostTrackingLLMProvider } from "../lib/cost-tracking";

export async function processConflictDetection(
  job: Job<{ methodStatementId: string }>
) {
  const { methodStatementId } = job.data;

  await db.workerJob.updateMany({
    where: {
      jobType: "conflict.detect",
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
      },
    });

    await job.updateProgress(10);

    // Pool A: project document passages
    const projectPassages = await db.sourcePassage.findMany({
      where: {
        sourceDocument: { projectId: ms.project.id },
        contentType: { in: ["text", "table"] },
      },
      orderBy: [{ sourceDocument: { authorityRank: "asc" } }, { pageNumber: "asc" }],
      take: 60,
      select: {
        id: true,
        extractedText: true,
        contentType: true,
        pageNumber: true,
        sourceDocument: { select: { title: true, authorityRank: true, documentType: true } },
      },
    });

    await job.updateProgress(25);

    // Pool B: non-excluded retrieval results
    const retrievalResults = await db.retrievalResult.findMany({
      where: { methodStatementId, excluded: false },
      include: {
        historicalMethodStatement: {
          select: {
            id: true,
            title: true,
            sourcePassages: {
              where: { contentType: { in: ["text", "table"] } },
              take: 5,
              select: { id: true, extractedText: true, contentType: true },
            },
          },
        },
      },
    });

    await job.updateProgress(40);

    const poolA: ConflictPassage[] = projectPassages.map((p, i) => ({
      passageId: p.id,
      content: p.extractedText,
      contentType: p.contentType,
      sourceRef: `DOC-${i + 1} (${p.sourceDocument?.title ?? "Project doc"}, p.${p.pageNumber ?? "?"})`,
      authorityRank: p.sourceDocument?.authorityRank,
    }));

    const poolB: ConflictPassage[] = retrievalResults.flatMap((r) =>
      r.historicalMethodStatement.sourcePassages.map((p, i) => ({
        passageId: p.id,
        content: p.extractedText,
        contentType: p.contentType,
        sourceRef: `PREC (${r.historicalMethodStatement.title})`,
        historicalMSId: r.historicalMethodStatement.id,
      }))
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const llm = new CostTrackingLLMProvider(
      new AnthropicLLMProvider(apiKey),
      { operation: "conflict-detection", methodStatementId, projectId: ms.project.id }
    );

    const conflicts = await detectConflicts(
      {
        trade: ms.trade.name,
        activity: ms.activity?.name,
        title: ms.title,
        projectDocPassages: poolA,
        precedentPassages: poolB,
      },
      llm
    );

    await job.updateProgress(80);

    // Persist new conflicts; skip if a conflict on the same topic already exists
    // and has been resolved
    const existingTopics = new Set(
      (
        await db.conflictRecord.findMany({
          where: {
            methodStatementId,
            resolution: { not: "UNRESOLVED" },
          },
          select: { topic: true },
        })
      ).map((c) => c.topic)
    );

    let created = 0;
    for (const conflict of conflicts) {
      if (existingTopics.has(conflict.topic)) continue;

      // Upsert by topic (avoid duplicate UNRESOLVED records on re-run)
      const existing = await db.conflictRecord.findFirst({
        where: { methodStatementId, topic: conflict.topic, resolution: "UNRESOLVED" },
        select: { id: true },
      });

      if (!existing) {
        await db.conflictRecord.create({
          data: {
            methodStatementId,
            conflictType: conflict.conflictType,
            topic: conflict.topic,
            currentRequirement: conflict.currentRequirement,
            conflictingContent: conflict.conflictingContent,
            currentSourceRef: conflict.currentSourceRef,
            conflictingSourceRef: conflict.conflictingSourceRef,
            precedentMSId: conflict.precedentMSId,
            recommendedAction: conflict.recommendedAction,
          },
        });
        created++;
      }
    }

    await job.updateProgress(100);

    await db.workerJob.updateMany({
      where: {
        jobType: "conflict.detect",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        result: { conflictCount: conflicts.length, created },
      },
    });

    return { methodStatementId, conflictCount: conflicts.length, created };
  } catch (error: any) {
    await db.workerJob.updateMany({
      where: {
        jobType: "conflict.detect",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
