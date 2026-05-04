// =============================================================================
// Worker service — BullMQ worker registration
// All jobs are idempotent and expose visible status (§9.2)
// =============================================================================

import "./lib/load-root-env";
import { Worker } from "bullmq";
import { getDeploymentEnvReport } from "@ams/shared";
import { connection } from "./queues";

// ── Environment validation (fail-fast on missing required config) ─────────────
function validateEnv() {
  const report = getDeploymentEnvReport(process.env, "worker");
  if (!report.ok) {
    console.error("Worker startup failed — required environment variables missing:");
    report.missing.forEach((issue) => console.error(`  ${issue.key}  (${issue.message})`));
    report.invalid.forEach((issue) => console.error(`  ${issue.key}  (${issue.message})`));
    process.exit(1);
  }

  if (report.warnings.length > 0) {
    console.warn("Warning — environment configuration may limit worker features:");
    report.warnings.forEach((issue) => console.warn(`  ${issue.key}  (${issue.message})`));
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
const ingestionConcurrency = parseInt(process.env.INGESTION_CONCURRENCY ?? "1");

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
  createWorker("document.ingest", ingestDispatcher, ingestionConcurrency),
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
