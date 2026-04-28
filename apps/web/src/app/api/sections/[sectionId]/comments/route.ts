// GET  /api/sections/[sectionId]/comments — list all top-level + threaded replies
// POST /api/sections/[sectionId]/comments — create a comment or reply

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const { sectionId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const comments = await db.comment.findMany({
    where: { sectionId, parentId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      resolved: true,
      createdAt: true,
      author: { select: { id: true, name: true, image: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          resolved: true,
          createdAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  return NextResponse.json({ comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const { sectionId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const body = await req.json().catch(() => null);

  if (!body?.content?.trim()) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  // Verify section exists (access gated via project membership on the section join)
  const section = await db.methodStatementSection.findFirst({
    where: {
      id: sectionId,
      methodStatement: { project: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const comment = await db.comment.create({
    data: {
      sectionId,
      authorId: userId,
      content: body.content.trim(),
      parentId: body.parentId ?? null,
    },
    select: {
      id: true,
      content: true,
      resolved: true,
      createdAt: true,
      author: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
