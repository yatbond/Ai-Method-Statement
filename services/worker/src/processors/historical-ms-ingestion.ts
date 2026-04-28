// =============================================================================
// Historical method statement ingestion processor (REQ-KB-001, REQ-ING-006)
//
// Creates SourcePassage records linked via historicalMSId (not sourceDocumentId)
// so they are retrievable by the hybrid ranker against the KB.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { createDocumentAIProviderAsync, getDocumentAIConfigFromEnv } from "@ams/ai-engine";
import { createStorageProvider } from "@ams/storage";
import { embeddingQueue, taggingQueue } from "../queues";

interface HistoricalMSIngestPayload {
  historicalMSId: string;
  fileKey: string;
  mimeType: string;
}

export async function processHistoricalMSIngestion(
  job: Job<HistoricalMSIngestPayload>
) {
  const { historicalMSId, fileKey, mimeType } = job.data;

  await db.workerJob.updateMany({
    where: { jobType: "historical-ms.ingest", payload: { path: ["historicalMSId"], equals: historicalMSId } },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const storage = createStorageProvider();
    const fileBuffer = await storage.download(fileKey);

    await job.updateProgress(15);

    const docAI = await createDocumentAIProviderAsync(getDocumentAIConfigFromEnv());
    const extraction = await docAI.extract(fileBuffer, mimeType);

    await job.updateProgress(50);

    const embeddingModelVersion =
      process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";
    const passageIds: string[] = [];

    for (const chunk of extraction.chunks) {
      let content: string;
      let imageStorageKey: string | undefined;

      if (chunk.type === "image" && chunk.imageData) {
        const imgKey = `knowledge-base/passages/${historicalMSId}/images/${passageIds.length}.bin`;
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

    await job.updateProgress(75);

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

    await db.workerJob.updateMany({
      where: {
        jobType: "historical-ms.ingest",
        payload: { path: ["historicalMSId"], equals: historicalMSId },
      },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        result: { passageCount: passageIds.length, pageCount: extraction.pageCount },
      },
    });

    return {
      historicalMSId,
      passageCount: passageIds.length,
      pageCount: extraction.pageCount,
      ocrUsed: extraction.ocrUsed,
    };
  } catch (error: any) {
    await db.workerJob.updateMany({
      where: {
        jobType: "historical-ms.ingest",
        payload: { path: ["historicalMSId"], equals: historicalMSId },
      },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
