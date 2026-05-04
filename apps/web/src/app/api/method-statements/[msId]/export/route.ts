// POST — trigger export generation
// GET  — return export history

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { exportQueue } from "@/lib/queues";
import { audit } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, title: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const exportOptions = {
    appendixAIncluded: body.appendixAIncluded !== false,
    appendixBIncluded: body.appendixBIncluded !== false,
    includeUnresolvedItemsAppendix: body.includeUnresolvedItemsAppendix === true,
  };

  await db.workerJob.create({
    data: {
      jobType: "export.generate",
      payload: { methodStatementId: msId, userId, exportOptions },
    },
  });

  await exportQueue.add(
    "export.generate",
    { methodStatementId: msId, userId, exportOptions },
    { attempts: 2, backoff: { type: "exponential", delay: 3000 } }
  );

  await audit({
    userId,
    action: "export.triggered",
    resourceType: "MethodStatement",
    resourceId: msId,
    metadata: { title: ms.title, exportOptions },
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
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [exports, latestJob] = await Promise.all([
    db.exportRecord.findMany({
      where: { methodStatementId: msId },
      orderBy: { exportedAt: "desc" },
      take: 10,
      select: {
        id: true,
        exportedAt: true,
        fileKey: true,
        fileHash: true,
        unresolvedGapCount: true,
        unresolvedConflictCount: true,
        poolAMarkerCount: true,
        poolBMarkerCount: true,
        appendixAIncluded: true,
        appendixBIncluded: true,
      },
    }),
    db.workerJob.findFirst({
      where: {
        jobType: "export.generate",
        payload: { path: ["methodStatementId"], equals: msId },
      },
      orderBy: { scheduledAt: "desc" },
      select: { status: true, completedAt: true, errorMessage: true, result: true },
    }),
  ]);

  return NextResponse.json({ exports, latestJob });
}
