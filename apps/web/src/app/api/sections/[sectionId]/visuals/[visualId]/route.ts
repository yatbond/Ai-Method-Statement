// PATCH /api/sections/[sectionId]/visuals/[visualId] — update diagram or mark reviewed
// DELETE /api/sections/[sectionId]/visuals/[visualId] — remove visual

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";

async function getAuthorizedSection(sectionId: string, userId: string) {
  return db.methodStatementSection.findFirst({
    where: {
      id: sectionId,
      methodStatement: { project: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sectionId: string; visualId: string }> }
) {
  const { sectionId, visualId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const section = await getAuthorizedSection(sectionId, userId);
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const visual = await db.visual.findFirst({
    where: { id: visualId, sectionId },
    select: { id: true },
  });
  if (!visual) return NextResponse.json({ error: "Visual not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title?.trim() ?? null;
  if (body.mermaidSource?.trim()) data.mermaidSource = body.mermaidSource.trim();
  if (typeof body.reviewedByUser === "boolean") {
    data.reviewedByUser = body.reviewedByUser;
    // Once a human reviews, it is no longer schematic-only (REQ-VIS-004)
    if (body.reviewedByUser === true) data.isSchematicOnly = false;
  }
  if (typeof body.insertionOrder === "number") data.insertionOrder = body.insertionOrder;

  const updated = await db.visual.update({
    where: { id: visualId },
    data,
    select: {
      id: true,
      visualType: true,
      title: true,
      mermaidSource: true,
      isSchematicOnly: true,
      reviewedByUser: true,
      insertionOrder: true,
      generatedAt: true,
    },
  });

  return NextResponse.json({ visual: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string; visualId: string }> }
) {
  const { sectionId, visualId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const section = await getAuthorizedSection(sectionId, userId);
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const visual = await db.visual.findFirst({
    where: { id: visualId, sectionId },
    select: { id: true },
  });
  if (!visual) return NextResponse.json({ error: "Visual not found." }, { status: 404 });

  await db.visual.delete({ where: { id: visualId } });
  return NextResponse.json({ ok: true });
}
