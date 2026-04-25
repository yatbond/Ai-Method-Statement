import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, DocumentType } from "@ams/database";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";
import { ingestionQueue } from "@ams/worker/src/queues";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const member = await db.projectMember.findFirst({
    where: { projectId, userId },
  });

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentType = (formData.get("documentType") as DocumentType) ?? DocumentType.OTHER;

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB.` },
      { status: 413 }
    );
  }

  // TODO: Upload file to object storage and get fileKey
  const fileKey = `projects/${projectId}/documents/${Date.now()}-${file.name}`;

  const document = await db.projectDocument.create({
    data: {
      projectId,
      filename: file.name,
      fileKey,
      fileSize: file.size,
      mimeType: file.type,
      documentType,
      // Authority rank based on document type
      authorityRank: getAuthorityRank(documentType),
    },
  });

  // Queue ingestion job
  await ingestionQueue.add("document.ingest", { documentId: document.id });

  await audit({
    userId,
    projectId,
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    resourceType: "ProjectDocument",
    resourceId: document.id,
    metadata: { filename: file.name, documentType },
  });

  return NextResponse.json(document, { status: 201 });
}

function getAuthorityRank(documentType: DocumentType): number {
  const ranks: Partial<Record<DocumentType, number>> = {
    CONTRACT: 1,
    SPECIFICATION: 2,
    DRAWING: 3,
    RISK_ASSESSMENT: 4,
    PROGRAMME: 5,
    SITE_CONSTRAINTS: 5,
  };
  return ranks[documentType] ?? 7;
}
