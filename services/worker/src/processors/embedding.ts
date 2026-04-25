// =============================================================================
// Embedding processor (REQ-RAG-002, REQ-RAG-006)
//
// Embeds source passages using Gemini Embedding 2.
// Records model version against every embedded chunk.
// =============================================================================

import type { Job } from "bullmq";
import { db } from "@ams/database";
import { createEmbeddingProvider } from "@ams/ai-engine";

export async function processEmbedding(
  job: Job<{ passageIds: string[]; modelVersion: string }>
) {
  const { passageIds, modelVersion } = job.data;

  const provider = createEmbeddingProvider({
    provider: "gemini",
    apiKey: process.env.GOOGLE_AI_API_KEY!,
    modelVersion,
  });

  let processed = 0;

  for (const passageId of passageIds) {
    const passage = await db.sourcePassage.findUniqueOrThrow({
      where: { id: passageId },
    });

    const request =
      passage.contentType === "image" || passage.contentType === "diagram"
        ? {
            content: Buffer.from(passage.imageStorageKey ?? ""),
            contentType: "image" as const,
          }
        : {
            content: passage.extractedText,
            contentType: "text" as const,
          };

    const { embedding } = await provider.embed(request);

    // Store embedding as pgvector — raw SQL for the vector type
    await db.$executeRaw`
      UPDATE "SourcePassage"
      SET embedding = ${`[${embedding.join(",")}]`}::vector,
          "embeddingModelVersion" = ${modelVersion},
          "lastVerifiedAt" = NOW()
      WHERE id = ${passageId}
    `;

    processed++;
    await job.updateProgress(Math.round((processed / passageIds.length) * 100));
  }

  return { processed, modelVersion };
}
