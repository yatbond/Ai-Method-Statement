// POST /api/method-statements/[msId]/approve
// Transitions IN_REVIEW → APPROVED. Human sign-off only (REQ-SIGN-003).
// No automated approval path.

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const body = await req.json().catch(() => ({}));
  const notes = (body.notes ?? "").trim();

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, status: true, projectId: true, reviewerOfRecord: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (ms.status !== "IN_REVIEW") {
    return NextResponse.json(
      { error: "Only IN_REVIEW method statements can be approved." },
      { status: 409 }
    );
  }

  const updated = await db.methodStatement.update({
    where: { id: msId },
    data: { status: "APPROVED" },
  });

  await db.auditLog.create({
    data: {
      userId,
      projectId: ms.projectId,
      action: "method_statement.approved",
      resourceType: "MethodStatement",
      resourceId: msId,
      metadata: { approvedBy: (session.user as any)?.name, notes },
    },
  });

  return NextResponse.json({ status: updated.status });
}
