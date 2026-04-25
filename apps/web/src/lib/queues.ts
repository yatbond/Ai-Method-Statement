// =============================================================================
// Queue client for the web app
// Used only in API routes (server-side) to enqueue background jobs.
// =============================================================================

import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null, lazyConnect: true }
);

export const ingestionQueue = new Queue("document.ingest", { connection });
export const embeddingQueue = new Queue("document.embed", { connection });
export const taggingQueue = new Queue("document.tag", { connection });
export const gapAnalysisQueue = new Queue("gap-analysis.run", { connection });
export const conflictQueue = new Queue("conflict.detect", { connection });
export const draftQueue = new Queue("draft.section", { connection });
export const exportQueue = new Queue("export.generate", { connection });
