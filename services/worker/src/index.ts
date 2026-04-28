// =============================================================================
// Worker service — BullMQ worker registration
// All jobs are idempotent and expose visible status (§9.2)
// =============================================================================

import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "./queues";

// ── Environment validation (fail-fast on missing required config) ─────────────
function validateEnv() {
  const required: Record<string, string> = {
    DATABASE_URL:      "PostgreSQL database connection",
    REDIS_URL:         "BullMQ job queue",
  };

  // At least one LLM provider must be configured
  const llmProvider = process.env.LLM_PROVIDER ?? "anthropic";
  const llmKeyMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai:    "OPENAI_API_KEY",
    ollama:    "OLLAMA_API_KEY",
  };
  const requiredLlmKey = llmKeyMap[llmProvider];
  if (!requiredLlmKey) {
    throw new Error(`Unknown LLM_PROVIDER: ${llmProvider}. Must be anthropic, openai, or ollama.`);
  }
  if (!process.env[requiredLlmKey]) {
    throw new Error(`${requiredLlmKey} not configured (LLM_PROVIDER=${llmProvider})`);
  }

  const optional: Record<string, string> = {
    GOOGLE_API_KEY:        "Google Document AI and Gemini embeddings",
    STORAGE_BUCKET:        "S3-compatible file storage",
    WORKER_CONCURRENCY:    "Worker parallelism (default: 5)",
  };

  const missing: string[] = [];
  for (const [key, purpose] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`  ${key}  (${purpose})`);
    }
  }

  if (missing.length > 0) {
    console.error("Worker startup failed — required environment variables missing:");
    missing.forEach((m) => console.error(m));
    process.exit(1);
  }

  const missingOptional: string[] = [];
  for (const [key, purpose] of Object.entries(optional)) {
    if (!process.env[key]) {
      missingOptional.push(`  ${key}  (${purpose})`);
    }
  }
  if (missingOptional.length > 0) {
    console.warn("Warning — optional environment variables not set (some features may be unavailable):");
    missingOptional.forEach((m) => console.warn(m));
  }
}

validateEnv();
import { processIngestion } from "./processors/ingestion";
import { processHistoricalMSIngestion } from "./processors/historical-ms-ingestion";
import { processEmbedding } from "./processors/embedding";
import { processTagging } from "./processors/tagging";
import { processGapAnalysis } from "./processors/gap-analysis";
import { processConflictDetection } from "./processors/conflict-detection";
import { processDraft } from "./processors/draft";
import { processExport } from "./processors/export";

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? "5");

function createWorker(
  queueName: string,
  processor: (job: any) => Promise<any>,
  workerConcurrency = concurrency
) {
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: workerConcurrency,
  });

  worker.on("completed", (job, result) => {
    console.log(`[${queueName}] ✓ Job ${job.id} completed`, JSON.stringify(result ?? {}).slice(0, 120));
  });

  worker.on("failed", (job, err) => {
    console.error(`[${queueName}] ✗ Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("progress", (job, progress) => {
    console.log(`[${queueName}] Job ${job.id} ${progress}%`);
  });

  return worker;
}

// document.ingest handles two job name variants: project documents and historical MS uploads
async function ingestDispatcher(job: any) {
  if (job.name === "historical-ms.ingest") {
    return processHistoricalMSIngestion(job);
  }
  return processIngestion(job);
}

const workers = [
  createWorker("document.ingest", ingestDispatcher, 3),
  createWorker("document.embed", processEmbedding, 5),
  createWorker("document.tag", processTagging, 3),
  createWorker("gap-analysis.run", processGapAnalysis, 2),
  createWorker("conflict.detect", processConflictDetection, 2),
  createWorker("draft.section", processDraft, 2),
  createWorker("export.generate", processExport, 2),
];

async function shutdown() {
  console.log("Shutting down workers…");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  console.log("Workers stopped.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(
  "Worker service started. Queues: document.ingest, document.embed, document.tag, gap-analysis.run"
);
