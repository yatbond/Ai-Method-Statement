// PATCH /api/projects/[id]/members/[memberId] — update role
// DELETE /api/projects/[id]/members/[memberId] — remove member

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";

async function requireAdminOrManager(projectId: string, userId: string) {
  const m = await db.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  return m && ["ADMIN", "MANAGER"].includes(m.role);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: projectId, memberId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  if (!(await requireAdminOrManager(projectId, userId))) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const valid = ["ADMIN", "MANAGER", "ENGINEER", "PLANNER", "SAFETY", "COORDINATOR", "VIEWER"];
  if (!body?.role || !valid.includes(body.role)) {
    return NextResponse.json({ error: "Valid role required." }, { status: 400 });
  }

  const updated = await db.projectMember.update({
    where: { id: memberId },
    data: { role: body.role },
    select: { id: true, role: true },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: projectId, memberId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  if (!(await requireAdminOrManager(projectId, userId))) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  // Prevent removing the last ADMIN
  const target = await db.projectMember.findUnique({
    where: { id: memberId },
    select: { role: true },
  });
  if (target?.role === "ADMIN") {
    const adminCount = await db.projectMember.count({
      where: { projectId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last admin. Assign another admin first." },
        { status: 409 }
      );
    }
  }

  await db.projectMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
