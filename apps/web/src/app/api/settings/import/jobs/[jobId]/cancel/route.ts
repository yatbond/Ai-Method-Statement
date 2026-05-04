import { NextResponse } from "next/server";
import { db } from "@ams/database";
import { getAuthUser } from "@/lib/auth";
import { ingestionQueue } from "@/lib/queues";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workerJob = await db.workerJob.findFirst({
    where: { id: jobId, jobType: "historical-ms.ingest" },
    select: { id: true, status: true, payload: true },
  });
  if (!workerJob) {
    return NextResponse.json({ error: "Ingestion job not found." }, { status: 404 });
  }

  const payload = (workerJob.payload ?? {}) as Record<string, any>;
  const queueJob = await findBullmqJob(payload);
  let queueState: string | null = null;
  let removedFromQueue = false;
  let active = false;

  if (queueJob) {
    queueState = await queueJob.getState();
    active = queueState === "active";
    await queueJob.discard();

    if (!active) {
      try {
        await queueJob.remove();
        removedFromQueue = true;
      } catch {
        removedFromQueue = false;
      }
    }
  }

  if (["COMPLETE", "CANCELLED"].includes(workerJob.status) || (workerJob.status === "FAILED" && !queueJob)) {
    return NextResponse.json({ error: `Job is already ${workerJob.status.toLowerCase()}.` }, { status: 409 });
  }

  await db.workerJob.update({
    where: { id: workerJob.id },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      errorMessage: active
        ? "Cancellation requested. The running ingestion will stop at its next checkpoint."
        : "Cancelled by user.",
      payload: {
        ...payload,
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: user.id,
        bullmqJobId: queueJob?.id ?? payload.bullmqJobId,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    active,
    removedFromQueue,
    queueState,
    message: active
      ? "Cancellation requested. The running ingestion will stop at its next checkpoint."
      : "Ingestion cancelled.",
  });
}

async function findBullmqJob(payload: Record<string, any>) {
  const bullmqJobId = typeof payload.bullmqJobId === "string" ? payload.bullmqJobId : null;
  if (bullmqJobId) {
    const queueJob = await ingestionQueue.getJob(bullmqJobId).catch(() => null);
    if (queueJob) return queueJob;
  }

  const queueJobs = await ingestionQueue
    .getJobs(["waiting", "active", "delayed", "paused", "prioritized", "waiting-children"], 0, 1000)
    .catch(() => []);

  return (
    queueJobs.find((candidate) => {
      if (candidate.name !== "historical-ms.ingest") return false;
      const data = candidate.data ?? {};
      return (
        (payload.historicalMSId && data.historicalMSId === payload.historicalMSId) ||
        (payload.fileKey && data.fileKey === payload.fileKey)
      );
    }) ?? null
  );
}
