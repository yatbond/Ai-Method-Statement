import { NextResponse } from "next/server";
import { db } from "@ams/database";
import { getAuthUser } from "@/lib/auth";
import { ingestionQueue } from "@/lib/queues";

const CANCELLABLE_QUEUE_STATES = [
  "waiting",
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
  "failed",
] as const;

const CANCELLABLE_DB_STATES = ["PENDING", "RUNNING", "RETRYING", "FAILED"] as const;
const STALE_DB_STATES = ["PENDING", "RUNNING", "RETRYING"] as const;

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queueJobs = await ingestionQueue.getJobs([...CANCELLABLE_QUEUE_STATES], 0, 10000).catch(() => []);
  const importQueueJobs = queueJobs.filter((job) => job.name === "historical-ms.ingest");

  let activeCount = 0;
  let removedCount = 0;
  let markedCount = 0;
  const markedWorkerJobIds = new Set<string>();

  for (const queueJob of importQueueJobs) {
    const state = await queueJob.getState().catch(() => null);
    if (state === "active") activeCount += 1;

    try {
      queueJob.discard();
    } catch {
      // Best-effort: a job may complete between listing and cancellation.
    }
    if (state !== "active") {
      await queueJob
        .remove()
        .then(() => {
          removedCount += 1;
        })
        .catch(() => undefined);
    }

    const data = queueJob.data ?? {};
    const workerJobId = typeof data.workerJobId === "string" ? data.workerJobId : null;
    const historicalMSId = typeof data.historicalMSId === "string" ? data.historicalMSId : null;
    const fileKey = typeof data.fileKey === "string" ? data.fileKey : null;
    const matchers = [
      ...(workerJobId ? [{ id: workerJobId }] : []),
      ...(historicalMSId ? [{ payload: { path: ["historicalMSId"], equals: historicalMSId } }] : []),
      ...(fileKey ? [{ payload: { path: ["fileKey"], equals: fileKey } }] : []),
    ];

    if (matchers.length === 0) continue;

    const updated = await db.workerJob.updateMany({
      where: {
        jobType: "historical-ms.ingest",
        status: { in: [...CANCELLABLE_DB_STATES] as any },
        OR: matchers,
      },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        errorMessage:
          state === "active"
            ? "Cancellation requested. The running ingestion will stop at its next checkpoint."
            : "Cancelled by user.",
      },
    });
    markedCount += updated.count;
    if (workerJobId) markedWorkerJobIds.add(workerJobId);
  }

  const staleJobs = await db.workerJob.updateMany({
    where: {
      jobType: "historical-ms.ingest",
      status: { in: [...STALE_DB_STATES] as any },
      id: { notIn: [...markedWorkerJobIds] },
    },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      errorMessage: "Cancelled by user.",
    },
  });

  return NextResponse.json({
    ok: true,
    cancelled: markedCount + staleJobs.count,
    activeCount,
    removedCount,
    message:
      activeCount > 0
        ? `Termination requested for ${activeCount} running import job(s); removed ${removedCount} queued/waiting/retry job(s).`
        : `Terminated ${markedCount + staleJobs.count} import job(s); removed ${removedCount} queued/waiting/retry job(s).`,
  });
}
