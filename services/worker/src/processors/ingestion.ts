// =============================================================================
// Document ingestion processor (REQ-ING)
//
// Full pipeline:
//  1. Download file from storage
//  2. Extract text / tables / images (PDF or DOCX)
//  3. Flag low-confidence OCR pages
//  4. Persist SourcePassage records
//  5. Queue AI-assisted metadata tagging
//  6. Queue embedding of all new passages
// =============================================================================

import type { Job } from "bullmq";
import { db, DocumentStatus } from "@ams/database";
import { createDocumentAIProviderAsync, getDocumentAIConfigFromEnv } from "@ams/ai-engine";
import { createStorageProvider } from "@ams/storage";
import { embeddingQueue } from "../queues";
import { taggingQueue } from "../queues";

export async function processIngestion(job: Job<{ documentId: string }>) {
  const { documentId } = job.data;

  await db.workerJob.updateMany({
    where: { sourceDocumentId: documentId, jobType: "document.ingest" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  await db.projectDocument.update({
    where: { id: documentId },
    data: { status: DocumentStatus.PROCESSING },
  });

  try {
    const document = await db.projectDocument.findUniqueOrThrow({
      where: { id: documentId },
    });

    await job.updateProgress(5);

    // Step 1: Download file from storage
    const storage = createStorageProvider();
    const fileBuffer = await storage.download(document.fileKey);

    await job.updateProgress(15);

    // Step 2: Extract content
    const docAI = await createDocumentAIProviderAsync(getDocumentAIConfigFromEnv());
    const extraction = await docAI.extract(fileBuffer, document.mimeType);

    await job.updateProgress(50);

    // Step 3: Persist SourcePassage records
    const embeddingModelVersion =
      process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";
    const passageIds: string[] = [];

    for (const chunk of extraction.chunks) {
      let content: string;
      let imageStorageKey: string | undefined;

      if (chunk.type === "image" && chunk.imageData) {
        // Store image to object storage
        const imgKey = `passages/${documentId}/images/${passageIds.length}.bin`;
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
          sourceDocumentId: documentId,
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

    // Step 4: Update document record
    const extractionErrors =
      extraction.errors.length > 0 ? extraction.errors : undefined;

    await db.projectDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.COMPLETE,
        pageCount: extraction.pageCount,
        ocrUsed: extraction.ocrUsed,
        processedAt: new Date(),
        extractionErrors: extractionErrors ?? undefined,
      },
    });

    // Step 5: Queue AI metadata tagging (for historical MS documents)
    await taggingQueue.add("document.tag", {
      documentId,
      passageIds: passageIds.slice(0, 20), // first 20 passages are enough for tagging
    });

    // Step 6: Queue embedding for all passages (REQ-RAG-002)
    if (passageIds.length > 0) {
      // Batch into groups of 50
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
      where: { sourceDocumentId: documentId, jobType: "document.ingest" },
      data: { status: "COMPLETE", completedAt: new Date(), result: { passageCount: passageIds.length } },
    });

    return {
      documentId,
      passageCount: passageIds.length,
      pageCount: extraction.pageCount,
      ocrUsed: extraction.ocrUsed,
      lowConfidencePages: extraction.lowConfidencePages,
      errors: extraction.errors,
    };
  } catch (error: any) {
    await db.projectDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.ERROR },
    });
    await db.workerJob.updateMany({
      where: { sourceDocumentId: documentId, jobType: "document.ingest" },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: error.message },
    });
    throw error;
  }
}
