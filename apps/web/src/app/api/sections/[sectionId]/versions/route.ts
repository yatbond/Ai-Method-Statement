// GET /api/sections/[sectionId]/versions — list all versions newest-first

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const { sectionId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const section = await db.methodStatementSection.findFirst({
    where: {
      id: sectionId,
      methodStatement: { project: { members: { some: { userId } } } },
    },
    select: { id: true },
  });
  if (!section) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const versions = await db.sectionVersion.findMany({
    where: { sectionId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      content: true,
      prompt: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ versions });
}
