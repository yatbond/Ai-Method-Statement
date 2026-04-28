import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { audit } from "@/lib/audit";

// PATCH — update tags or supersede an MS
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const body = await req.json();

  const ms = await db.historicalMethodStatement.findUnique({ where: { id: msId } });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Update tags (user-editable per REQ-ING-005)
  if (body.tags) {
    // Delete existing AI-generated tags and replace with user-verified ones
    await db.historicalMSTag.deleteMany({
      where: { historicalMethodStatementId: msId },
    });
    for (const tag of body.tags as Array<{ key: string; value: string }>) {
      await db.historicalMSTag.create({
        data: {
          historicalMethodStatementId: msId,
          key: tag.key,
          value: tag.value,
          aiGenerated: false, // user-verified
        },
      });
    }
  }

  // Supersede
  if (body.approvalStatus === "WITHDRAWN" || body.approvalStatus === "SUPERSEDED") {
    await db.historicalMethodStatement.update({
      where: { id: msId },
      data: {
        approvalStatus: body.approvalStatus,
        supersededAt: new Date(),
      },
    });
  }

  await audit({
    userId,
    action: "knowledge_base.ms_updated",
    resourceType: "HistoricalMethodStatement",
    resourceId: msId,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}
