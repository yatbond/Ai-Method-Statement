// =============================================================================
// Section API (REQ-DRAFT-002, Phase 6)
//
// GET  — return current section with content, versions, and specificity score
// POST — trigger AI draft of this section (queued to draft.section worker)
// PUT  — save user-edited content directly
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { draftQueue } from "@/lib/queues";
import { audit } from "@/lib/audit";
import { STANDARD_SECTIONS } from "@ams/shared";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [section, draftJob] = await Promise.all([
    db.methodStatementSection.findFirst({
    where: { methodStatementId: msId, sectionKey },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 5,
        select: { id: true, version: true, createdAt: true, createdBy: true },
      },
      _count: { select: { comments: true } },
    },
    }),
    db.workerJob.findFirst({
      where: {
        jobType: "draft.section",
        payload: {
          path: ["methodStatementId"],
          equals: msId,
        },
        AND: [{ payload: { path: ["sectionKey"], equals: sectionKey } }],
      },
      orderBy: { scheduledAt: "desc" },
      select: { id: true, status: true, errorMessage: true, result: true, scheduledAt: true, completedAt: true },
    }),
  ]);

  return NextResponse.json(section ? { ...section, draftJob } : null);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, title: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sectionDef = STANDARD_SECTIONS.find((s) => s.key === sectionKey);
  if (!sectionDef) {
    return NextResponse.json({ error: "Unknown section key." }, { status: 400 });
  }

  const section = await db.methodStatementSection.upsert({
    where: {
      methodStatementId_sectionKey: { methodStatementId: msId, sectionKey },
    },
    create: {
      methodStatementId: msId,
      sectionKey,
      sectionTitle: sectionDef.title,
      orderIndex: sectionDef.order,
      status: "DRAFTING",
    },
    update: {
      status: "DRAFTING",
    },
  });

  // Create a WorkerJob record for status visibility
  const workerJob = await db.workerJob.create({
    data: {
      jobType: "draft.section",
      payload: { methodStatementId: msId, sectionKey, userId },
    },
  });

  await draftQueue.add(
    "draft.section",
    { methodStatementId: msId, sectionKey, userId, workerJobId: workerJob.id },
    { attempts: 2, backoff: { type: "exponential", delay: 3000 } }
  );

  await audit({
    userId,
    action: "section.draft_triggered",
    resourceType: "MethodStatement",
    resourceId: msId,
    metadata: { sectionKey, title: ms.title },
  });

  return NextResponse.json({ queued: true, sectionKey, workerJobId: workerJob.id, section });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json() as { content?: string; draftingNotes?: string };
  const hasContent = typeof body.content === "string";
  const hasDraftingNotes = typeof body.draftingNotes === "string";
  if (!hasContent && !hasDraftingNotes) {
    return NextResponse.json({ error: "content or draftingNotes is required." }, { status: 400 });
  }

  const sectionDef = STANDARD_SECTIONS.find((s) => s.key === sectionKey);
  const content = body.content ?? "";

  const section = await db.methodStatementSection.upsert({
    where: {
      methodStatementId_sectionKey: { methodStatementId: msId, sectionKey },
    },
    create: {
      methodStatementId: msId,
      sectionKey,
      sectionTitle: sectionDef?.title ?? sectionKey,
      orderIndex: sectionDef?.order ?? 0,
      ...(hasContent ? { content, status: "DRAFT" as const } : {}),
      ...(hasDraftingNotes ? { draftingNotes: body.draftingNotes } : {}),
    },
    update: {
      ...(hasContent ? { content, status: "DRAFT" as const } : {}),
      ...(hasDraftingNotes ? { draftingNotes: body.draftingNotes } : {}),
    },
  });

  // Save as a new version
  if (hasContent) {
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
  }

  return NextResponse.json(section);
}
