import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { STANDARD_SECTIONS } from "@ams/shared";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  // Verify membership
  const member = await db.projectMember.findFirst({
    where: {
      projectId,
      userId,
      role: { in: ["ADMIN", "MANAGER", "ENGINEER"] },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, tradeId, activityId } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!tradeId) {
    return NextResponse.json({ error: "Trade is required." }, { status: 400 });
  }

  // Find active trade pack
  const tradePack = await db.tradePack.findFirst({
    where: { tradeId, isActive: true },
  });

  const ms = await db.methodStatement.create({
    data: {
      projectId,
      tradeId,
      activityId: activityId || null,
      tradePackId: tradePack?.id || null,
      title: title.trim(),
      // Create all standard sections as stubs
      sections: {
        create: STANDARD_SECTIONS.map((s) => ({
          sectionKey: s.key,
          sectionTitle: s.title,
          orderIndex: s.order,
        })),
      },
    },
  });

  await audit({
    userId,
    projectId,
    action: AUDIT_ACTIONS.MS_CREATED,
    resourceType: "MethodStatement",
    resourceId: ms.id,
    metadata: { title: ms.title, tradeId },
  });

  return NextResponse.json(ms, { status: 201 });
}
