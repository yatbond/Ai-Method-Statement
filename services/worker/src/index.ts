// =============================================================================
// Worker service entry point
//
// Registers BullMQ workers for all background job types.
// All jobs are idempotent and expose visible status (REQ architecture §9.2).
// =============================================================================

import { Worker } from "bullmq";
import { connection } from "./queues";
import { processIngestion } from "./processors/ingestion";
import { processEmbedding } from "./processors/embedding";

function createWorker(queueName: string, processor: (job: any) => Promise<any>) {
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5"),
  });

  worker.on("completed", (job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
  });

  worker.on("progress", (job, progress) => {
    console.log(`[${queueName}] Job ${job.id} progress: ${progress}%`);
  });

  return worker;
}

const workers = [
  createWorker("document.ingest", processIngestion),
  createWorker("document.embed", processEmbedding),
];

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  console.log("Workers stopped.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`Worker service started. Listening on ${workers.length} queues.`);
