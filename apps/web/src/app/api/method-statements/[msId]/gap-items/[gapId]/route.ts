// =============================================================================
// Gap item update API (REQ-GAP-002, REQ-GAP-003)
//
// PATCH — user confirms an answer, marks N/A, or overrides a suggested answer.
//
// REQ-P2: User confirmation required before any answer enters the draft.
// Status transitions:
//   TO_BE_CONFIRMED | MISSING | SUGGESTED_FROM_PRECEDENT
//     → CONFIRMED_BY_USER (user provides/accepts answer)
//     → NOT_APPLICABLE   (user marks it N/A)
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { audit } from "@/lib/audit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ msId: string; gapId: string }> }
) {
  const { msId, gapId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  // Ownership check via method statement membership
  const ms = await db.methodStatement.findFirst({
    where: {
      id: msId,
      project: { members: { some: { userId } } },
    },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const gapItem = await db.gapItem.findFirst({
    where: { id: gapId, methodStatementId: msId },
  });
  if (!gapItem) return NextResponse.json({ error: "Gap item not found." }, { status: 404 });

  const body = await req.json();
  const { action, answer, notApplicableReason } = body as {
    action: "confirm" | "not_applicable";
    answer?: string;
    notApplicableReason?: string;
  };

  if (action === "confirm") {
    if (!answer?.trim()) {
      return NextResponse.json({ error: "answer is required to confirm." }, { status: 400 });
    }
    const updated = await db.gapItem.update({
      where: { id: gapId },
      data: {
        status: "CONFIRMED_BY_USER",
        answer: answer.trim(),
        confirmedById: userId,
        confirmedAt: new Date(),
      },
    });
    await audit({
      userId,
      action: "gap_item.confirmed",
      resourceType: "GapItem",
      resourceId: gapId,
      metadata: { category: gapItem.category, msId },
    });
    return NextResponse.json(updated);
  }

  if (action === "not_applicable") {
    const updated = await db.gapItem.update({
      where: { id: gapId },
      data: {
        status: "NOT_APPLICABLE",
        notApplicableReason: notApplicableReason?.trim() ?? null,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
    });
    await audit({
      userId,
      action: "gap_item.marked_na",
      resourceType: "GapItem",
      resourceId: gapId,
      metadata: { category: gapItem.category, msId },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
