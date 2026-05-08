// =============================================================================
// Historical method statement ingestion processor (REQ-KB-001, REQ-ING-006)
//
// Creates SourcePassage records linked via historicalMSId (not sourceDocumentId)
// so they are retrievable by the hybrid ranker against the KB.
// =============================================================================

import { UnrecoverableError, type Job } from "bullmq";
import { db, applyRuntimeSettingsToProcessEnv } from "@ams/database";
import {
  createDocumentAIProviderAsync,
  getDocumentAIConfigFromEnv,
  type ExtractedChunk,
} from "@ams/ai-engine";
import { createStorageProvider } from "@ams/storage";
import type { StorageProvider } from "@ams/storage";
import { REQUIRED_EMBEDDING_MODEL } from "@ams/shared";
import { embeddingQueue, ingestionQueue, taggingQueue } from "../queues";
import { loadRootEnv } from "../lib/load-root-env";

interface HistoricalMSIngestPayload {
  workerJobId?: string;
  historicalMSId: string;
  fileKey: string;
  mimeType: string;
}

type IngestionBatchCheckpoint = {
  startPage: number;
  endPage: number;
  passageIds: string[];
  chunkCount: number;
  completedAt: string;
};

type IngestionCheckpoint = {
  version: 1;
  pageCount?: number;
  completedBatches: IngestionBatchCheckpoint[];
  lowConfidencePages: number[];
  errors: Array<{ page: number; message: string }>;
};

class CancelledIngestionError extends Error {
  constructor() {
    super("Ingestion cancelled by user.");
    this.name = "CancelledIngestionError";
  }
}

export async function processHistoricalMSIngestion(
  job: Job<HistoricalMSIngestPayload>
) {
  loadRootEnv();
  await applyRuntimeSettingsToProcessEnv();
  const { workerJobId, historicalMSId, fileKey, mimeType } = job.data;

  if (await isCancelled(workerJobId, historicalMSId)) {
    return { historicalMSId, cancelled: true };
  }
  await db.workerJob.updateMany({
    where: {
      ...workerJobWhere(workerJobId, historicalMSId),
      status: { not: "CANCELLED" as any },
    },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  await db.historicalMethodStatement.update({
    where: { id: historicalMSId },
    data: { approvalStatus: "PROCESSING" as any },
  });

  try {
    await assertNotCancelled(workerJobId, historicalMSId);
    const storage = createStorageProvider();
    const fileBuffer = await storage.download(fileKey);
    const embeddingModelVersion =
      process.env.GEMINI_EMBEDDING_MODEL ?? REQUIRED_EMBEDDING_MODEL;
    const checkpoint = await readIngestionCheckpoint(workerJobId, historicalMSId);
    const checkpointedPassageIds = checkpoint.completedBatches.flatMap((batch) => batch.passageIds);
    let persistedPassageIds = [...checkpointedPassageIds];
    const useBatchCheckpointing =
      getDocumentAIConfigFromEnv().provider === "zai" && mimeType === "application/pdf";

    await job.updateProgress(15);
    await assertNotCancelled(workerJobId, historicalMSId);

    const docAI = await createDocumentAIProviderAsync({
      ...getDocumentAIConfigFromEnv(),
      shouldCancel: () => isCancelled(workerJobId, historicalMSId),
      completedPageRanges: checkpoint.completedBatches.map((batch) => ({
        startPage: batch.startPage,
        endPage: batch.endPage,
      })),
      onProgress: async (progress) => {
        if (progress.stage === "zai-batch-complete" && progress.totalPages) {
          const extractionProgress =
            15 + Math.floor((Math.min(progress.processedPages ?? 0, progress.totalPages) / progress.totalPages) * 35);
          await job.updateProgress(Math.min(49, extractionProgress));
        }
      },
      onBatchComplete: useBatchCheckpointing
        ? async (batch) => {
            await assertNotCancelled(workerJobId, historicalMSId);
            const passageIds = await persistChunks({
              historicalMSId,
              chunks: batch.chunks,
              storage,
              embeddingModelVersion,
              existingPassageCount: persistedPassageIds.length,
            });
            persistedPassageIds.push(...passageIds);
            await appendIngestionCheckpoint(workerJobId, historicalMSId, {
              startPage: batch.batchStartPage,
              endPage: batch.batchEndPage,
              passageIds,
              chunkCount: batch.chunks.length,
              completedAt: new Date().toISOString(),
            }, {
              pageCount: batch.totalPages,
              lowConfidencePages: batch.lowConfidencePages,
              errors: batch.errors,
            });
          }
        : undefined,
    });
    const extraction = await docAI.extract(fileBuffer, mimeType);
    if (extraction.chunks.length === 0 && persistedPassageIds.length === 0) {
      throw new Error(
        "No extractable text was found. This PDF appears to be scanned; choose a Document AI OCR provider such as Z.ai GLM-OCR, Gemini, or Ollama before ingesting it."
      );
    }

    await job.updateProgress(50);
    await assertNotCancelled(workerJobId, historicalMSId);

    let passageIds = persistedPassageIds;
    if (!useBatchCheckpointing || persistedPassageIds.length === checkpointedPassageIds.length) {
      const newPassageIds = await persistChunks({
        historicalMSId,
        chunks: extraction.chunks,
        storage,
        embeddingModelVersion,
        existingPassageCount: persistedPassageIds.length,
      });
      passageIds = [...persistedPassageIds, ...newPassageIds];
      persistedPassageIds = passageIds;
    }

    await job.updateProgress(75);
    await assertNotCancelled(workerJobId, historicalMSId);

    // Queue AI metadata tagging using first 20 passages (REQ-ING-004)
    if (passageIds.length > 0) {
      await taggingQueue.add("document.tag", {
        historicalMSId,
        passageIds: passageIds.slice(0, 20),
      });

      const batchSize = 50;
      for (let i = 0; i < passageIds.length; i += batchSize) {
        await embeddingQueue.add("document.embed", {
          passageIds: passageIds.slice(i, i + batchSize),
          modelVersion: embeddingModelVersion,
        });
      }
    }

    await job.updateProgress(100);
    await assertNotCancelled(workerJobId, historicalMSId);

    await db.workerJob.updateMany({
      where: {
        ...workerJobWhere(workerJobId, historicalMSId),
        status: { not: "CANCELLED" as any },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        errorMessage: null,
        result: { passageCount: passageIds.length, pageCount: extraction.pageCount },
      },
    });
    await db.historicalMethodStatement.update({
      where: { id: historicalMSId },
      data: { approvalStatus: "COMPLETE" as any },
    });

    return {
      historicalMSId,
      passageCount: passageIds.length,
      pageCount: extraction.pageCount,
      ocrUsed: extraction.ocrUsed,
    };
  } catch (error: any) {
    if (error instanceof CancelledIngestionError || /cancelled by user/i.test(String(error?.message ?? error))) {
      await db.workerJob.updateMany({
        where: workerJobWhere(workerJobId, historicalMSId),
        data: {
          status: "CANCELLED" as any,
          completedAt: new Date(),
          errorMessage: "Cancelled by user.",
        },
      });
      await db.historicalMethodStatement.update({
        where: { id: historicalMSId },
        data: { approvalStatus: "ERROR" as any },
      });
      return { historicalMSId, cancelled: true };
    }

    const permanent = isPermanentIngestionError(error);
    const willRetry = !permanent && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    await db.workerJob.updateMany({
      where: {
        ...workerJobWhere(workerJobId, historicalMSId),
        status: { not: "CANCELLED" as any },
      },
      data: {
        status: (willRetry ? "RETRYING" : "FAILED") as any,
        completedAt: willRetry ? null : new Date(),
        errorMessage: error.message,
      },
    });
    if (isQuotaExceededError(error)) {
      await cancelPendingImportJobsDueToQuota(workerJobId);
    }
    if (!willRetry) {
      await db.historicalMethodStatement.update({
        where: { id: historicalMSId },
        data: { approvalStatus: "ERROR" as any },
      });
    }
    if (permanent) throw new UnrecoverableError(error.message);
    throw error;
  }
}

async function persistChunks(options: {
  historicalMSId: string;
  chunks: ExtractedChunk[];
  storage: StorageProvider;
  embeddingModelVersion: string;
  existingPassageCount: number;
}) {
  const { historicalMSId, chunks, storage, embeddingModelVersion } = options;
  const passageIds: string[] = [];

  for (const chunk of chunks) {
    let content: string;
    let imageStorageKey: string | undefined;
    const passageIndex = options.existingPassageCount + passageIds.length;

    if (chunk.type === "image" && chunk.imageData) {
      const imgKey = `knowledge-base/passages/${historicalMSId}/images/${passageIndex}.bin`;
      await storage.upload(imgKey, chunk.imageData, "image/png");
      imageStorageKey = imgKey;
      content = chunk.content || "[image]";
    } else {
      content = chunk.type === "table"
        ? JSON.stringify(chunk.tableData)
        : chunk.content;
    }

    const passage = await db.sourcePassage.create({
      data: {
        historicalMSId,
        pageNumber: chunk.pageNumber,
        sectionHeading: chunk.sectionHeading,
        extractedText: content,
        contentType: chunk.type,
        imageStorageKey,
        embeddingModelVersion,
        lastVerifiedAt: new Date(),
      },
    });
    passageIds.push(passage.id);
  }

  return passageIds;
}

async function readIngestionCheckpoint(
  workerJobId: string | undefined,
  historicalMSId: string
): Promise<IngestionCheckpoint> {
  const workerJob = await db.workerJob.findFirst({
    where: workerJobWhere(workerJobId, historicalMSId),
    select: { result: true },
  });
  const checkpoint = (workerJob?.result as any)?.ingestionCheckpoint;
  if (!checkpoint || checkpoint.version !== 1) {
    return { version: 1, completedBatches: [], lowConfidencePages: [], errors: [] };
  }

  return {
    version: 1,
    pageCount: typeof checkpoint.pageCount === "number" ? checkpoint.pageCount : undefined,
    completedBatches: Array.isArray(checkpoint.completedBatches)
      ? checkpoint.completedBatches.filter(isValidBatchCheckpoint)
      : [],
    lowConfidencePages: Array.isArray(checkpoint.lowConfidencePages)
      ? checkpoint.lowConfidencePages.filter((page: unknown): page is number => Number.isInteger(page))
      : [],
    errors: Array.isArray(checkpoint.errors)
      ? checkpoint.errors.filter(isValidExtractionError)
      : [],
  };
}

async function appendIngestionCheckpoint(
  workerJobId: string | undefined,
  historicalMSId: string,
  batch: IngestionBatchCheckpoint,
  extraction: {
    pageCount: number;
    lowConfidencePages: number[];
    errors: Array<{ page: number; message: string }>;
  }
) {
  const workerJob = await db.workerJob.findFirst({
    where: workerJobWhere(workerJobId, historicalMSId),
    select: { result: true },
  });
  const existing = (workerJob?.result as any) ?? {};
  const checkpoint = await readIngestionCheckpoint(workerJobId, historicalMSId);
  const completedBatches = [
    ...checkpoint.completedBatches.filter(
      (existingBatch) => existingBatch.startPage !== batch.startPage || existingBatch.endPage !== batch.endPage
    ),
    batch,
  ].sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage);

  await db.workerJob.updateMany({
    where: workerJobWhere(workerJobId, historicalMSId),
    data: {
      result: {
        ...existing,
        ingestionCheckpoint: {
          version: 1,
          pageCount: extraction.pageCount,
          completedBatches,
          lowConfidencePages: uniqueNumbers([
            ...checkpoint.lowConfidencePages,
            ...extraction.lowConfidencePages,
          ]),
          errors: mergeExtractionErrors([
            ...checkpoint.errors,
            ...extraction.errors,
          ]),
        },
      },
    },
  });
}

function isValidBatchCheckpoint(value: any): value is IngestionBatchCheckpoint {
  return (
    Number.isInteger(value?.startPage) &&
    Number.isInteger(value?.endPage) &&
    value.startPage > 0 &&
    value.endPage >= value.startPage &&
    Array.isArray(value.passageIds)
  );
}

function isValidExtractionError(value: any): value is { page: number; message: string } {
  return Number.isInteger(value?.page) && typeof value?.message === "string";
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
}

function mergeExtractionErrors(errors: Array<{ page: number; message: string }>) {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.page}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function workerJobWhere(workerJobId: string | undefined, historicalMSId: string) {
  return workerJobId
    ? { id: workerJobId, jobType: "historical-ms.ingest" }
    : {
        jobType: "historical-ms.ingest",
        payload: { path: ["historicalMSId"], equals: historicalMSId },
      };
}

async function isCancelled(workerJobId: string | undefined, historicalMSId: string) {
  const workerJob = await db.workerJob.findFirst({
    where: workerJobWhere(workerJobId, historicalMSId),
    select: { status: true },
  });
  return workerJob?.status === ("CANCELLED" as any);
}

async function assertNotCancelled(workerJobId: string | undefined, historicalMSId: string) {
  if (await isCancelled(workerJobId, historicalMSId)) {
    throw new CancelledIngestionError();
  }
}

function isPermanentIngestionError(error: any) {
  const message = String(error?.message ?? error);
  return /quota exceeded|insufficient balance|no resource package|supports PDFs up to 50 MB|rejected the API key|No extractable text was found|API key not configured/i.test(message);
}

function isQuotaExceededError(error: any) {
  return /quota exceeded|insufficient balance|no resource package|RESOURCE_EXHAUSTED/i.test(String(error?.message ?? error));
}

async function cancelPendingImportJobsDueToQuota(currentWorkerJobId?: string) {
  const queueJobs = await ingestionQueue
    .getJobs(["waiting", "delayed", "paused", "prioritized", "waiting-children", "active"], 0, 10000)
    .catch(() => []);

  for (const queueJob of queueJobs) {
    if (queueJob.name !== "historical-ms.ingest") continue;
    if (currentWorkerJobId && queueJob.id === currentWorkerJobId) continue;

    const state = await queueJob.getState().catch(() => null);
    try {
      queueJob.discard();
    } catch {
      // Best effort: the job may have completed between listing and cancellation.
    }
    if (state !== "active") {
      await queueJob.remove().catch(() => undefined);
    }
  }

  await db.workerJob.updateMany({
    where: {
      jobType: "historical-ms.ingest",
      status: { in: ["PENDING", "RUNNING", "RETRYING"] as any },
      ...(currentWorkerJobId ? { id: { not: currentWorkerJobId } } : {}),
    },
    data: {
      status: "CANCELLED" as any,
      completedAt: new Date(),
      errorMessage: "Cancelled automatically because Gemini quota is exhausted.",
    },
  });
  const cancelledJobs = await db.workerJob.findMany({
    where: {
      jobType: "historical-ms.ingest",
      status: "CANCELLED" as any,
      errorMessage: "Cancelled automatically because Gemini quota is exhausted.",
    },
    select: { payload: true },
  });
  const cancelledHistoricalMSIds = cancelledJobs
    .map((job) => (job.payload as any)?.historicalMSId)
    .filter((id): id is string => typeof id === "string");
  if (cancelledHistoricalMSIds.length > 0) {
    await db.historicalMethodStatement.updateMany({
      where: { id: { in: cancelledHistoricalMSIds } },
      data: { approvalStatus: "ERROR" as any },
    });
  }
}
