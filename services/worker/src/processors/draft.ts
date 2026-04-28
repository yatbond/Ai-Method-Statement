// =============================================================================
// Section draft processor (REQ-DRAFT-002, Phase 6)
//
// Drafts a single method statement section using confirmed evidence.
// Creates a SectionVersion for history, updates section content + status,
// computes specificity score, and persists ReferenceMarker records for cited passages.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { draftSection, type SourcePassageForDraft, createLLMProvider, getLLMConfigFromEnv } from "@ams/ai-engine";
import { buildMethodStatementBrief } from "@ams/ai-engine";
import { analyseSpecificity } from "@ams/ai-engine";
import type { SectionKey } from "@ams/shared";
import { CostTrackingLLMProvider } from "../lib/cost-tracking";

interface DraftJobPayload {
  methodStatementId: string;
  sectionKey: string;
  userId: string;
}

export async function processDraft(job: Job<DraftJobPayload>) {
  const { methodStatementId, sectionKey, userId } = job.data;

  await db.workerJob.updateMany({
    where: {
      jobType: "draft.section",
      payload: {
        path: ["methodStatementId"],
        equals: methodStatementId,
      },
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
          where: { status: { in: ["CONFIRMED_BY_USER", "CONFIRMED_BY_DOCUMENT"] } },
          select: { category: true, question: true, answer: true, status: true },
        },
        conflicts: {
          where: { resolution: "UNRESOLVED" },
          select: { topic: true },
        },
        retrievals: {
          where: { excluded: false },
          include: {
            historicalMethodStatement: {
              select: { id: true, title: true, trade: { select: { name: true } } },
            },
          },
        },
      },
    });

    await job.updateProgress(10);

    // Pool B: project document passages ordered by authority rank
    const projectPassages = await db.sourcePassage.findMany({
      where: {
        sourceDocument: {
          projectId: ms.project.id,
        },
        contentType: { in: ["text", "table"] },
      },
      orderBy: [
        { sourceDocument: { authorityRank: "asc" } },
        { pageNumber: "asc" },
      ],
      take: 80,
      select: {
        id: true,
        extractedText: true,
        contentType: true,
        pageNumber: true,
        sectionHeading: true,
        sourceDocument: {
          select: { title: true, authorityRank: true, documentType: true },
        },
      },
    });

    // Pool A: passages from included precedents
    const precedentPassages = await db.sourcePassage.findMany({
      where: {
        historicalMSId: {
          in: ms.retrievals.map((r) => r.historicalMSId),
        },
        contentType: { in: ["text", "table"] },
      },
      take: 40,
      select: {
        id: true,
        extractedText: true,
        contentType: true,
        pageNumber: true,
        sectionHeading: true,
        historicalMethodStatement: { select: { title: true } },
      },
    });

    await job.updateProgress(30);

    const passages: SourcePassageForDraft[] = [
      ...projectPassages.map((p) => ({
        passageId: p.id,
        content: p.extractedText,
        contentType: p.contentType,
        pageNumber: p.pageNumber,
        sectionHeading: p.sectionHeading,
        sourceRef: `${p.sourceDocument?.title ?? "Project doc"} p.${p.pageNumber ?? "?"}`,
        pool: "B" as const,
        authorityRank: p.sourceDocument?.authorityRank,
      })),
      ...precedentPassages.map((p) => ({
        passageId: p.id,
        content: p.extractedText,
        contentType: p.contentType,
        pageNumber: p.pageNumber,
        sectionHeading: p.sectionHeading,
        sourceRef: `Precedent: ${p.historicalMethodStatement?.title ?? "Historical MS"}`,
        pool: "A" as const,
      })),
    ];

    // Build a brief from available confirmed data
    const brief = buildMethodStatementBrief({
      trade: ms.trade.name,
      activity: ms.activity?.name,
      title: ms.title,
      projectDocuments: [],
      retrievedPrecedents: ms.retrievals.map((r) => ({
        historicalMSId: r.historicalMSId,
        title: r.historicalMethodStatement.title,
        trade: r.historicalMethodStatement.trade.name,
        retrievalReason: "",
        score: r.score,
      })),
      confirmedAnswers: ms.gapItems.map((g) => ({
        category: g.category,
        question: g.question,
        answer: g.answer ?? "",
      })),
      missingGapCategories: [],
      unresolvedConflicts: ms.conflicts.map((c) => c.topic),
    });

    // Get existing section for potential revision
    const existingSection = await db.methodStatementSection.findFirst({
      where: { methodStatementId, sectionKey },
      select: { id: true, content: true },
    });

    // Get standard section definition
    const { STANDARD_SECTIONS } = await import("@ams/shared");
    const sectionDef = STANDARD_SECTIONS.find((s) => s.key === sectionKey);

    const llm = new CostTrackingLLMProvider(
      createLLMProvider(getLLMConfigFromEnv()),
      { operation: "drafting", methodStatementId, projectId: ms.project.id }
    );

    await job.updateProgress(50);

    const draftResult = await draftSection(
      {
        sectionKey: sectionKey as SectionKey,
        sectionTitle: sectionDef?.title ?? sectionKey,
        methodStatementTitle: ms.title,
        trade: ms.trade.name,
        activity: ms.activity?.name,
        brief,
        confirmedAnswers: ms.gapItems.map((g) => ({
          category: g.category,
          question: g.question,
          answer: g.answer ?? "",
        })),
        passages,
        previousContent: existingSection?.content ?? undefined,
      },
      llm
    );

    await job.updateProgress(75);

    // Analyse specificity of drafted content
    const specificity = analyseSpecificity(draftResult.content);

    // Upsert the section
    const section = await db.methodStatementSection.upsert({
      where: {
        methodStatementId_sectionKey: { methodStatementId, sectionKey },
      },
      create: {
        methodStatementId,
        sectionKey,
        sectionTitle: sectionDef?.title ?? sectionKey,
        orderIndex: sectionDef?.order ?? 0,
        content: draftResult.content,
        status: "DRAFT",
        specificityScore: specificity.score,
      },
      update: {
        content: draftResult.content,
        status: "DRAFT",
        specificityScore: specificity.score,
      },
    });

    // Save version for history
    const lastVersion = await db.sectionVersion.findFirst({
      where: { sectionId: section.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await db.sectionVersion.create({
      data: {
        sectionId: section.id,
        version: (lastVersion?.version ?? 0) + 1,
        content: draftResult.content,
        createdBy: userId,
        prompt: `AI draft — ${new Date().toISOString()}`,
      },
    });

    // Create reference markers for cited passages
    const existingMarkerCount = await db.referenceMarker.count({
      where: { methodStatementId, sectionId: section.id, deletedAt: null },
    });

    for (const passageId of draftResult.citedPassageIds) {
      const passage = passages.find((p) => p.passageId === passageId);
      if (!passage) continue;

      await db.referenceMarker.create({
        data: {
          methodStatementId,
          sectionId: section.id,
          pool: passage.pool,
          sourcePassageId: passageId,
          sourcePassageExcerpt: passage.content.slice(0, 500),
          sourcePageOrSection: passage.pageNumber ? `p.${passage.pageNumber}` : null,
          indexNumber: existingMarkerCount + 1,
          createdBy: userId,
        },
      });
    }

    await job.updateProgress(100);

    await db.workerJob.updateMany({
      where: {
        jobType: "draft.section",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        result: {
          sectionKey,
          specificityScore: specificity.score,
          gapCount: draftResult.gapCount,
          citedSources: draftResult.citedPassageIds.length,
        },
      },
    });

    return {
      sectionKey,
      specificityScore: specificity.score,
      gapCount: draftResult.gapCount,
    };
  } catch (error: any) {
    await db.workerJob.updateMany({
      where: {
        jobType: "draft.section",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
