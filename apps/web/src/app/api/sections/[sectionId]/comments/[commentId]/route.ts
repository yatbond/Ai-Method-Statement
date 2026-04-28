// PATCH /api/sections/[sectionId]/comments/[commentId]
// Toggle resolved state or update content (author only).

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sectionId: string; commentId: string }> }
) {
  const { commentId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const body = await req.json().catch(() => ({}));

  const comment = await db.comment.findFirst({
    where: { id: commentId },
    select: { id: true, authorId: true },
  });
  if (!comment) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const data: Record<string, unknown> = {};

  // Resolved toggle: any project member can resolve
  if (typeof body.resolved === "boolean") data.resolved = body.resolved;

  // Content update: author only
  if (body.content !== undefined) {
    if (comment.authorId !== userId) {
      return NextResponse.json({ error: "Only the author can edit content." }, { status: 403 });
    }
    data.content = body.content.trim();
  }

  const updated = await db.comment.update({
    where: { id: commentId },
    data,
    select: { id: true, content: true, resolved: true },
  });

  return NextResponse.json({ comment: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string; commentId: string }> }
) {
  const { commentId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const comment = await db.comment.findFirst({
    where: { id: commentId, authorId: userId },
    select: { id: true },
  });
  if (!comment) return NextResponse.json({ error: "Not found or not your comment." }, { status: 404 });

  await db.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
