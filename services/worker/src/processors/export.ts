// =============================================================================
// Export processor (REQ-EXPORT, Phase 8)
//
// Generates a .docx method statement from all drafted sections.
// REQ-SIGN-001: No AI watermark on output.
// REQ-SIGN-003: Status remains DRAFT — human sign-off required.
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "crypto";
import { db } from "@ams/database";
import { generateWordDocument } from "@ams/ai-engine";
import { createStorageProvider } from "@ams/storage";

interface ExportJobPayload {
  methodStatementId: string;
  userId: string;
  exportOptions: {
    appendixAIncluded: boolean;
    appendixBIncluded: boolean;
    includeUnresolvedItemsAppendix: boolean;
  };
}

export async function processExport(job: Job<ExportJobPayload>) {
  const { methodStatementId, userId, exportOptions } = job.data;

  await db.workerJob.updateMany({
    where: {
      jobType: "export.generate",
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
        project: { select: { name: true, client: true } },
        sections: {
          where: { status: { not: "NOT_STARTED" } },
          orderBy: { orderIndex: "asc" },
          select: {
            sectionKey: true,
            sectionTitle: true,
            orderIndex: true,
            content: true,
          },
        },
        gapItems: {
          where: { status: { in: ["MISSING", "TO_BE_CONFIRMED"] } },
          select: { category: true, question: true },
        },
        conflicts: {
          where: { resolution: "UNRESOLVED" },
          select: { topic: true, currentRequirement: true, conflictingContent: true },
        },
        referenceMarkers: {
          where: { deletedAt: null },
          include: {
            sourceDocument: { select: { title: true } },
            sourcePassage: {
              select: {
                extractedText: true,
                pageNumber: true,
                historicalMethodStatement: { select: { title: true } },
              },
            },
          },
          orderBy: { indexNumber: "asc" },
        },
      },
    });

    await job.updateProgress(20);

    const exportedByUser = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const references = ms.referenceMarkers.map((m) => ({
      indexNumber: m.indexNumber,
      pool: m.pool as "A" | "B",
      sourceTitle:
        m.sourceDocument?.title ??
        m.sourcePassage?.historicalMethodStatement?.title ??
        "Unknown source",
      sourceRef: m.sourcePageOrSection,
      excerpt:
        m.sourcePassageExcerpt ??
        m.sourcePassage?.extractedText.slice(0, 300),
    }));

    const docBuffer = await generateWordDocument({
      methodStatementTitle: ms.title,
      trade: ms.trade.name,
      activity: ms.activity?.name,
      projectName: ms.project.name,
      client: ms.project.client ?? undefined,
      sections: ms.sections,
      references,
      unresolvedGaps: ms.gapItems,
      unresolvedConflicts: ms.conflicts,
      exportOptions,
      exportedBy: exportedByUser.name ?? exportedByUser.email,
      exportedAt: new Date(),
    });

    await job.updateProgress(75);

    // Upload to storage
    const storage = createStorageProvider();
    const fileKey = `exports/${methodStatementId}/${Date.now()}-method-statement.docx`;
    await storage.upload(
      fileKey,
      docBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Compute file hash (REQ-EXPORT for audit trail)
    const fileHash = createHash("sha256").update(docBuffer).digest("hex");

    // Snapshot input versions
    const inputVersionSnapshot = {
      sectionCount: ms.sections.length,
      exportedAt: new Date().toISOString(),
      unresolvedGaps: ms.gapItems.length,
      unresolvedConflicts: ms.conflicts.length,
    };

    const exportRecord = await db.exportRecord.create({
      data: {
        methodStatementId,
        exportedBy: userId,
        fileKey,
        fileHash,
        inputVersionSnapshot,
        unresolvedGapCount: ms.gapItems.length,
        unresolvedConflictCount: ms.conflicts.length,
        specificityWarnings: 0,
        appendixAIncluded: exportOptions.appendixAIncluded,
        appendixBIncluded: exportOptions.appendixBIncluded,
        unresolvedItemsAppendix: exportOptions.includeUnresolvedItemsAppendix,
        poolAMarkerCount: references.filter((r) => r.pool === "A").length,
        poolBMarkerCount: references.filter((r) => r.pool === "B").length,
      },
    });

    await job.updateProgress(100);

    await db.workerJob.updateMany({
      where: {
        jobType: "export.generate",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        result: { exportRecordId: exportRecord.id, fileKey },
      },
    });

    return { exportRecordId: exportRecord.id, fileKey };
  } catch (error: any) {
    await db.workerJob.updateMany({
      where: {
        jobType: "export.generate",
        payload: { path: ["methodStatementId"], equals: methodStatementId },
      },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
