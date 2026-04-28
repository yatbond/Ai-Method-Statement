import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id: projectId, docId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const member = await db.projectMember.findFirst({
    where: { projectId, userId },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const passages = await db.sourcePassage.findMany({
    where: { sourceDocumentId: docId },
    orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      pageNumber: true,
      sectionHeading: true,
      contentType: true,
      extractedText: true,
      embeddingModelVersion: true,
      lastVerifiedAt: true,
    },
  });

  // Don't expose embeddings over the API
  return NextResponse.json(passages);
}
