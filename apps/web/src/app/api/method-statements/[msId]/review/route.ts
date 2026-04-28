// POST /api/method-statements/[msId]/review
// Transitions DRAFT → IN_REVIEW. Sets reviewerOfRecord (REQ-SIGN-002).

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
  const reviewerName = (body.reviewerName ?? (session.user as any)?.name ?? "").trim();

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, status: true, projectId: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (ms.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only DRAFT method statements can be submitted for review." },
      { status: 409 }
    );
  }

  const updated = await db.methodStatement.update({
    where: { id: msId },
    data: { status: "IN_REVIEW", reviewerOfRecord: reviewerName },
  });

  await db.auditLog.create({
    data: {
      userId,
      projectId: ms.projectId,
      action: "method_statement.submitted_for_review",
      resourceType: "MethodStatement",
      resourceId: msId,
      metadata: { reviewerOfRecord: reviewerName },
    },
  });

  return NextResponse.json({ status: updated.status, reviewerOfRecord: updated.reviewerOfRecord });
}
