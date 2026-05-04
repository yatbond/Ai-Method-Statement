// =============================================================================
// Queue client for the web app
// Used only in API routes (server-side) to enqueue background jobs.
// =============================================================================

import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl && process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL is required to enqueue background jobs.");
    }

    connection = new IORedis(redisUrl ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return connection;
}

const queues = new Map<string, Queue>();

function getQueue(name: string) {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection: getConnection() });
  queues.set(name, queue);
  return queue;
}

function lazyQueue(name: string) {
  return new Proxy({} as Queue, {
    get(_target, prop, receiver) {
      const queue = getQueue(name);
      const value = Reflect.get(queue, prop, receiver);
      return typeof value === "function" ? value.bind(queue) : value;
    },
  });
}

export const ingestionQueue = lazyQueue("document.ingest");
export const embeddingQueue = lazyQueue("document.embed");
export const taggingQueue = lazyQueue("document.tag");
export const gapAnalysisQueue = lazyQueue("gap-analysis.run");
export const conflictQueue = lazyQueue("conflict.detect");
export const draftQueue = lazyQueue("draft.section");
export const exportQueue = lazyQueue("export.generate");
