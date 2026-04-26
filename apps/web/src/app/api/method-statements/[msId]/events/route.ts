// =============================================================================
// Server-Sent Events endpoint (P12 — v1.2, REQ-RT-001)
//
// GET /api/method-statements/[msId]/events
//
// Streams WorkerJob status changes and MethodStatement status updates to the
// browser as SSE events. Polls the DB every 3 seconds and pushes changes.
// Clients connect once and receive incremental updates, replacing manual polling
// in the Gap Analysis, Conflict Detection, Draft, and Export panels.
//
// Event types:
//   worker_job   — { jobType, status, result?, errorMessage? }
//   ms_status    — { status }
//   heartbeat    — {} (every 15s to keep connection alive)
// =============================================================================

import { auth } from "@/lib/auth";
import { db } from "@ams/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = (session.user as any)?.id as string;

  // Verify access
  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, status: true },
  });
  if (!ms) return new Response("Not found", { status: 404 });

  // Snapshot of last-known job statuses to detect changes
  const lastJobStatus: Record<string, string> = {};
  let lastMsStatus = ms.status;

  const encoder = new TextEncoder();

  function sseEvent(eventType: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial snapshot
      const jobs = await db.workerJob.findMany({
        where: {
          payload: { path: ["methodStatementId"], equals: msId },
        },
        orderBy: { scheduledAt: "desc" },
        take: 20,
        select: { jobType: true, status: true, result: true, errorMessage: true },
      });

      for (const job of jobs) {
        lastJobStatus[job.jobType] = job.status;
      }

      controller.enqueue(
        sseEvent("snapshot", {
          msStatus: ms.status,
          jobs: jobs.map((j) => ({
            jobType: j.jobType,
            status: j.status,
            result: j.result,
            errorMessage: j.errorMessage,
          })),
        })
      );

      let active = true;
      let heartbeatTick = 0;

      const interval = setInterval(async () => {
        if (!active) return;

        try {
          heartbeatTick++;
          if (heartbeatTick % 5 === 0) {
            // Heartbeat every 15 seconds (5 × 3s)
            controller.enqueue(sseEvent("heartbeat", {}));
          }

          // Poll for method statement status change
          const currentMs = await db.methodStatement.findUnique({
            where: { id: msId },
            select: { status: true },
          });
          if (currentMs && currentMs.status !== lastMsStatus) {
            lastMsStatus = currentMs.status;
            controller.enqueue(sseEvent("ms_status", { status: currentMs.status }));
          }

          // Poll for worker job status changes
          const latestJobs = await db.workerJob.findMany({
            where: { payload: { path: ["methodStatementId"], equals: msId } },
            orderBy: { scheduledAt: "desc" },
            take: 20,
            select: { jobType: true, status: true, result: true, errorMessage: true },
          });

          for (const job of latestJobs) {
            if (lastJobStatus[job.jobType] !== job.status) {
              lastJobStatus[job.jobType] = job.status;
              controller.enqueue(
                sseEvent("worker_job", {
                  jobType: job.jobType,
                  status: job.status,
                  result: job.result,
                  errorMessage: job.errorMessage,
                })
              );
            }
          }
        } catch {
          // DB read failure — keep stream open, retry on next tick
        }
      }, 3000);

      // Close stream when client disconnects
      const cleanup = () => {
        active = false;
        clearInterval(interval);
        try { controller.close(); } catch {}
      };

      // ReadableStream cancel fires when client closes the connection
      return cleanup;
    },
    cancel() {
      // Handled in start() via the returned cleanup fn
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
