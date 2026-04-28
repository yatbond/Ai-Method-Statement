// GET  /api/sections/[sectionId]/visuals — list diagram attachments
// POST /api/sections/[sectionId]/visuals — create a Mermaid diagram

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

  const userId = user.id;

  const section = await db.methodStatementSection.findFirst({
    where: {
      id: sectionId,
      methodStatement: { project: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const visuals = await db.visual.findMany({
    where: { sectionId },
    orderBy: [{ insertionOrder: "asc" }, { generatedAt: "asc" }],
    select: {
      id: true,
      visualType: true,
      title: true,
      mermaidSource: true,
      structuredData: true,
      isSchematicOnly: true,
      reviewedByUser: true,
      insertionOrder: true,
      generatedAt: true,
    },
  });

  return NextResponse.json({ visuals });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const { sectionId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const section = await db.methodStatementSection.findFirst({
    where: {
      id: sectionId,
      methodStatement: { project: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.mermaidSource?.trim()) {
    return NextResponse.json({ error: "mermaidSource is required." }, { status: 400 });
  }

  const lastOrder = await db.visual.findFirst({
    where: { sectionId },
    orderBy: { insertionOrder: "desc" },
    select: { insertionOrder: true },
  });

  const visual = await db.visual.create({
    data: {
      sectionId,
      visualType: "DIAGRAM",
      title: body.title?.trim() ?? null,
      mermaidSource: body.mermaidSource.trim(),
      isSchematicOnly: true, // REQ-VIS-004: labelled schematic until human review
      reviewedByUser: false,
      insertionOrder: (lastOrder?.insertionOrder ?? 0) + 1,
    },
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

  return NextResponse.json({ visual }, { status: 201 });
}
