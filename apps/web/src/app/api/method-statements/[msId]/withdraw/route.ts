// POST /api/method-statements/[msId]/withdraw
// Transitions APPROVED/IN_REVIEW → WITHDRAWN.
// DRAFT → WITHDRAWN also allowed (cancellation).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;
  const body = await req.json().catch(() => ({}));
  const reason = (body.reason ?? "").trim();

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, status: true, projectId: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (ms.status === "WITHDRAWN") {
    return NextResponse.json({ error: "Already withdrawn." }, { status: 409 });
  }

  const updated = await db.methodStatement.update({
    where: { id: msId },
    data: { status: "WITHDRAWN" },
  });

  await db.auditLog.create({
    data: {
      userId,
      projectId: ms.projectId,
      action: "method_statement.withdrawn",
      resourceType: "MethodStatement",
      resourceId: msId,
      metadata: { reason, previousStatus: ms.status },
    },
  });

  return NextResponse.json({ status: updated.status });
}
