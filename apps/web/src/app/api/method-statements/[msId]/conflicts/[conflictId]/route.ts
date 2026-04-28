// PATCH — resolve a conflict record
// Resolutions: ACCEPT_CURRENT | ACCEPT_PRECEDENT | MANUAL_EDIT | EXCLUDED

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { audit } from "@/lib/audit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ msId: string; conflictId: string }> }
) {
  const { msId, conflictId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const conflict = await db.conflictRecord.findFirst({
    where: { id: conflictId, methodStatementId: msId },
  });
  if (!conflict) return NextResponse.json({ error: "Conflict not found." }, { status: 404 });

  const { resolution, resolutionNote } = await req.json() as {
    resolution: "ACCEPT_CURRENT" | "ACCEPT_PRECEDENT" | "MANUAL_EDIT" | "EXCLUDED";
    resolutionNote?: string;
  };

  const VALID = ["ACCEPT_CURRENT", "ACCEPT_PRECEDENT", "MANUAL_EDIT", "EXCLUDED"];
  if (!VALID.includes(resolution)) {
    return NextResponse.json({ error: "Invalid resolution." }, { status: 400 });
  }

  const updated = await db.conflictRecord.update({
    where: { id: conflictId },
    data: {
      resolution,
      resolutionNote: resolutionNote?.trim() ?? null,
      resolvedAt: new Date(),
    },
  });

  await audit({
    userId,
    action: "conflict.resolved",
    resourceType: "ConflictRecord",
    resourceId: conflictId,
    metadata: { msId, resolution, topic: conflict.topic },
  });

  return NextResponse.json(updated);
}
