// POST — queue a conflict.detect job
// GET  — return current conflict records with job status

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import { conflictQueue } from "@/lib/queues";
import { audit } from "@/lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, title: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.workerJob.create({
    data: {
      jobType: "conflict.detect",
      payload: { methodStatementId: msId },
    },
  });

  await conflictQueue.add(
    "conflict.detect",
    { methodStatementId: msId },
    { attempts: 2, backoff: { type: "exponential", delay: 3000 } }
  );

  await audit({
    userId,
    action: "conflict_detection.triggered",
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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [conflicts, latestJob] = await Promise.all([
    db.conflictRecord.findMany({
      where: { methodStatementId: msId },
      orderBy: { createdAt: "desc" },
      include: {
        historicalMethodStatement: { select: { title: true } },
      },
    }),
    db.workerJob.findFirst({
      where: {
        jobType: "conflict.detect",
        payload: { path: ["methodStatementId"], equals: msId },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true, completedAt: true, errorMessage: true },
    }),
  ]);

  return NextResponse.json({ conflicts, latestJob });
}
