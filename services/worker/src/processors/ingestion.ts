// =============================================================================
// Document ingestion processor (REQ-ING)
//
// Extracts text, tables, and images from uploaded documents.
// Runs OCR on scanned PDFs with confidence scoring.
// Creates SourcePassage records for later embedding.
// =============================================================================

import type { Job } from "bullmq";
import { db, DocumentStatus } from "@ams/database";
import { createDocumentAIProvider, OCR_CONFIDENCE_THRESHOLD } from "@ams/ai-engine";
import { OCR_CONFIDENCE_THRESHOLD as THRESHOLD } from "@ams/shared";
import { embeddingQueue } from "../queues";

export async function processIngestion(job: Job<{ documentId: string }>) {
  const { documentId } = job.data;

  await db.projectDocument.update({
    where: { id: documentId },
    data: { status: DocumentStatus.PROCESSING },
  });

  await db.workerJob.updateMany({
    where: { sourceDocumentId: documentId, jobType: "document.ingest" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const document = await db.projectDocument.findUniqueOrThrow({
      where: { id: documentId },
    });

    // TODO: Retrieve file from object storage using document.fileKey
    const fileBuffer = Buffer.alloc(0); // placeholder

    const docAI = createDocumentAIProvider({
      provider: (process.env.DOCUMENT_AI_PROVIDER as "google" | "mock") ?? "mock",
      projectId: process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID,
      location: process.env.GOOGLE_DOCUMENT_AI_LOCATION,
      processorId: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
    });

    await job.updateProgress(10);

    const extraction = await docAI.extract(fileBuffer, document.mimeType);

    await job.updateProgress(50);

    // Persist SourcePassage records
    const passageIds: string[] = [];

    for (const chunk of extraction.chunks) {
      const passage = await db.sourcePassage.create({
        data: {
          sourceDocumentId: documentId,
          pageNumber: chunk.pageNumber,
          sectionHeading: chunk.sectionHeading,
          extractedText:
            chunk.type === "table"
              ? JSON.stringify(chunk.tableData)
              : chunk.content,
          contentType: chunk.type,
          embeddingModelVersion: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
          lastVerifiedAt: new Date(),
        },
      });
      passageIds.push(passage.id);
    }

    await job.updateProgress(80);

    // Update document status
    await db.projectDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.COMPLETE,
        pageCount: extraction.pageCount,
        ocrUsed: extraction.ocrUsed,
        processedAt: new Date(),
        extractionErrors:
          extraction.errors.length > 0 ? extraction.errors : undefined,
      },
    });

    // Queue embedding for all extracted passages
    await embeddingQueue.add("document.embed", {
      passageIds,
      modelVersion: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
    });

    await job.updateProgress(100);

    return {
      documentId,
      passageCount: passageIds.length,
      pageCount: extraction.pageCount,
      lowConfidencePages: extraction.lowConfidencePages,
    };
  } catch (error) {
    await db.projectDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.ERROR },
    });
    throw error;
  }
}
