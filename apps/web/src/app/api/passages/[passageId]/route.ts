// GET /api/passages/[passageId]
// Returns passage content and source metadata for the inline citation viewer.
// Access is gated: passage must belong to a project the user is a member of,
// or to a historical MS that is in an approved state.

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ passageId: string }> }
) {
  const { passageId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const passage = await db.sourcePassage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      extractedText: true,
      contentType: true,
      pageNumber: true,
      sectionHeading: true,
      sourceDocument: {
        select: {
          title: true,
          documentType: true,
          authorityRank: true,
          project: {
            select: {
              id: true,
              name: true,
              members: { where: { userId }, select: { userId: true } },
            },
          },
        },
      },
      historicalMethodStatement: {
        select: {
          id: true,
          title: true,
          trade: { select: { name: true } },
          approvalStatus: true,
        },
      },
    },
  });

  if (!passage) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Access check: project member, or open historical MS
  const isMember = passage.sourceDocument?.project?.members?.length ?? 0 > 0;
  const isPublicHistorical =
    passage.historicalMethodStatement?.approvalStatus === "COMPLETE";

  if (!isMember && !isPublicHistorical) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    id: passage.id,
    content: passage.extractedText,
    contentType: passage.contentType,
    pageNumber: passage.pageNumber,
    sectionHeading: passage.sectionHeading,
    source: passage.sourceDocument
      ? {
          type: "project",
          title: passage.sourceDocument.title,
          documentType: passage.sourceDocument.documentType,
          authorityRank: passage.sourceDocument.authorityRank,
          projectName: passage.sourceDocument.project?.name,
        }
      : {
          type: "historical",
          title: passage.historicalMethodStatement?.title,
          trade: passage.historicalMethodStatement?.trade?.name,
        },
  });
}
