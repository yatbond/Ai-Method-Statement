// =============================================================================
// Section API (REQ-DRAFT-002, Phase 6)
//
// GET  — return current section with content, versions, and specificity score
// POST — trigger AI draft of this section (queued to draft.section worker)
// PUT  — save user-edited content directly
// =============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import { draftQueue } from "@/lib/queues";
import { audit } from "@/lib/audit";
import { STANDARD_SECTIONS } from "@ams/shared";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const section = await db.methodStatementSection.findFirst({
    where: { methodStatementId: msId, sectionKey },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 5,
        select: { id: true, version: true, createdAt: true, createdBy: true },
      },
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json(section ?? null);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, title: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sectionDef = STANDARD_SECTIONS.find((s) => s.key === sectionKey);
  if (!sectionDef) {
    return NextResponse.json({ error: "Unknown section key." }, { status: 400 });
  }

  // Create a WorkerJob record for status visibility
  await db.workerJob.create({
    data: {
      jobType: "draft.section",
      payload: { methodStatementId: msId, sectionKey, userId },
    },
  });

  await draftQueue.add(
    "draft.section",
    { methodStatementId: msId, sectionKey, userId },
    { attempts: 2, backoff: { type: "exponential", delay: 3000 } }
  );

  await audit({
    userId,
    action: "section.draft_triggered",
    resourceType: "MethodStatement",
    resourceId: msId,
    metadata: { sectionKey, title: ms.title },
  });

  return NextResponse.json({ queued: true, sectionKey });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { content } = await req.json() as { content: string };
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const sectionDef = STANDARD_SECTIONS.find((s) => s.key === sectionKey);

  const section = await db.methodStatementSection.upsert({
    where: {
      methodStatementId_sectionKey: { methodStatementId: msId, sectionKey },
    },
    create: {
      methodStatementId: msId,
      sectionKey,
      sectionTitle: sectionDef?.title ?? sectionKey,
      orderIndex: sectionDef?.order ?? 0,
      content,
      status: "DRAFT",
    },
    update: {
      content,
      status: "DRAFT",
    },
  });

  // Save as a new version
  const lastVersion = await db.sectionVersion.findFirst({
    where: { sectionId: section.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await db.sectionVersion.create({
    data: {
      sectionId: section.id,
      version: (lastVersion?.version ?? 0) + 1,
      content,
      createdBy: userId,
    },
  });

  return NextResponse.json(section);
}
