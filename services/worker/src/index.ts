// =============================================================================
// Worker service — BullMQ worker registration
// All jobs are idempotent and expose visible status (§9.2)
// =============================================================================

import { Worker } from "bullmq";
import { connection } from "./queues";
import { processIngestion } from "./processors/ingestion";
import { processHistoricalMSIngestion } from "./processors/historical-ms-ingestion";
import { processEmbedding } from "./processors/embedding";
import { processTagging } from "./processors/tagging";
import { processGapAnalysis } from "./processors/gap-analysis";
import { processConflictDetection } from "./processors/conflict-detection";
import { processDraft } from "./processors/draft";

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
