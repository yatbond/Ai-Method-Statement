// =============================================================================
// Embedding processor (REQ-RAG-002, REQ-RAG-006)
//
// Embeds source passages using Google Gemini Embedding 2.
// Records the embedding model version against every chunk (REQ-RAG-006).
// Images and diagrams use the multimodal embedding path.
//
// CRITICAL: Text-only models MUST NOT be substituted here (REQ-RAG-002).
// =============================================================================

import type { Job } from "bullmq";
import { db, applyRuntimeSettingsToProcessEnv } from "@ams/database";
import { createEmbeddingProvider } from "@ams/ai-engine";
import { createStorageProvider } from "@ams/storage";
import { REQUIRED_EMBEDDING_MODEL } from "@ams/shared";

const BATCH_DELAY_MS = 100; // rate-limit between Gemini API calls

export async function processEmbedding(
  job: Job<{ passageIds: string[]; modelVersion: string }>
) {
  await applyRuntimeSettingsToProcessEnv();
  const { passageIds } = job.data;
  const modelVersion = process.env.GEMINI_EMBEDDING_MODEL || REQUIRED_EMBEDDING_MODEL;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_AI_API_KEY is not set. " +
        "Gemini Embedding 2 is required for REQ-RAG-002. " +
        "Text-only embedding models must not be substituted."
    );
  }

  const provider = createEmbeddingProvider({
    provider: "gemini",
    apiKey,
    modelVersion,
  });

  const storage = createStorageProvider();
  let processed = 0;
  let skipped = 0;

  for (const passageId of passageIds) {
    const passage = await db.sourcePassage.findUnique({
      where: { id: passageId },
    });

    if (!passage) {
      skipped++;
      continue;
    }

    // Skip if already embedded with the same model version (idempotent)
    // We check by querying for a non-null embedding — raw SQL because
    // Prisma can't filter on vector columns.
    const alreadyEmbedded = await db.$queryRaw<Array<{ has_embedding: boolean }>>`
      SELECT (embedding IS NOT NULL) AS has_embedding
      FROM "SourcePassage"
      WHERE id = ${passageId}
        AND "embeddingModelVersion" = ${modelVersion}
    `;
    if (alreadyEmbedded[0]?.has_embedding) {
      skipped++;
      processed++;
      await job.updateProgress(Math.round((processed / passageIds.length) * 100));
      continue;
    }

    try {
      let embeddingRequest: { content: string | Buffer; contentType: "text" | "image" };

      if (
        (passage.contentType === "image" || passage.contentType === "diagram") &&
        passage.imageStorageKey
      ) {
        // Multimodal: download image and embed it
        const imageBuffer = await storage.download(passage.imageStorageKey);
        embeddingRequest = { content: imageBuffer, contentType: "image" };
      } else {
        // Text / table: embed as text
        embeddingRequest = { content: passage.extractedText, contentType: "text" };
      }

      const { embedding } = await provider.embed(embeddingRequest);

      // Store embedding as pgvector — must use raw SQL
      await db.$executeRaw`
        UPDATE "SourcePassage"
        SET
          embedding = ${`[${embedding.join(",")}]`}::vector,
          "embeddingModelVersion" = ${modelVersion},
          "lastVerifiedAt" = NOW()
        WHERE id = ${passageId}
      `;

      processed++;
    } catch (err: any) {
      console.error(`Failed to embed passage ${passageId}: ${err.message}`);
      // Don't throw — continue with remaining passages
      processed++;
    }

    // Gentle rate-limiting to avoid hitting Gemini API quotas
    if (processed % 10 === 0) {
      await sleep(BATCH_DELAY_MS);
    }

    await job.updateProgress(Math.round((processed / passageIds.length) * 100));
  }

  return { processed, skipped, modelVersion };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
