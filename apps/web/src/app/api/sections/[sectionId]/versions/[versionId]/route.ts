// POST /api/sections/[sectionId]/versions/[versionId]/restore
// Restores the section content to the given version by creating a new version.

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sectionId: string; versionId: string }> }
) {
  const { sectionId, versionId } = await params;
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

  const target = await db.sectionVersion.findFirst({
    where: { id: versionId, sectionId },
    select: { id: true, version: true, content: true },
  });
  if (!target) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  // Create a new version stamped as a manual restore
  const latest = await db.sectionVersion.findFirst({
    where: { sectionId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const [newVersion] = await db.$transaction([
    db.sectionVersion.create({
      data: {
        sectionId,
        version: (latest?.version ?? 0) + 1,
        content: target.content,
        createdBy: userId,
        prompt: `Restored from v${target.version}`,
      },
    }),
    db.methodStatementSection.update({
      where: { id: sectionId },
      data: { content: target.content, status: "DRAFT" },
    }),
  ]);

  return NextResponse.json({ version: newVersion.version, content: target.content });
}
