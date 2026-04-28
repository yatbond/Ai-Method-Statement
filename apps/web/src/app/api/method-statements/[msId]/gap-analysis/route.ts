// =============================================================================
// Gap analysis trigger API (REQ-GAP-001)
//
// POST  — queue a gap-analysis.run job for the method statement
// GET   — return current gap items with status summary
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { gapAnalysisQueue } from "@/lib/queues";
import { audit } from "@/lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: {
      id: msId,
      project: { members: { some: { userId } } },
    },
    select: { id: true, title: true },
  });

  if (!ms) return NextResponse.json({ error: "Method statement not found." }, { status: 404 });

  // Create a WorkerJob record so status is visible in the UI
  await db.workerJob.create({
    data: {
      jobType: "gap-analysis.run",
      payload: { methodStatementId: msId },
    },
  });

  await gapAnalysisQueue.add(
    "gap-analysis.run",
    { methodStatementId: msId },
    { attempts: 2, backoff: { type: "exponential", delay: 3000 } }
  );

  await audit({
    userId,
    action: "gap_analysis.triggered",
    resourceType: "MethodStatement",
    resourceId: msId,
    metadata: { title: ms.title },
  });

  return NextResponse.json({ queued: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: {
      id: msId,
      project: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [gapItems, latestJob] = await Promise.all([
    db.gapItem.findMany({
      where: { methodStatementId: msId },
      orderBy: { createdAt: "asc" },
    }),
    db.workerJob.findFirst({
      where: {
        jobType: "gap-analysis.run",
        payload: { path: ["methodStatementId"], equals: msId },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, completedAt: true, errorMessage: true },
    }),
  ]);

  return NextResponse.json({ gapItems, latestJob });
}
