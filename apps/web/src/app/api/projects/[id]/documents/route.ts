import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db, DocumentType } from "@ams/database";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";
import { createStorageProvider } from "@ams/storage";
import { ingestionQueue } from "@/lib/queues";

const AUTHORITY_RANKS: Partial<Record<DocumentType, number>> = {
  CONTRACT: 1,
  SPECIFICATION: 2,
  DRAWING: 3,
  RISK_ASSESSMENT: 4,
  PROGRAMME: 5,
  SITE_CONSTRAINTS: 5,
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const member = await db.projectMember.findFirst({
    where: { projectId, userId },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const documents = await db.projectDocument.findMany({
    where: { projectId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      filename: true,
      fileSize: true,
      mimeType: true,
      documentType: true,
      status: true,
      pageCount: true,
      ocrUsed: true,
      extractionErrors: true,
      uploadedAt: true,
      processedAt: true,
      authorityRank: true,
    },
  });

  return NextResponse.json(documents);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const member = await db.projectMember.findFirst({
    where: { projectId, userId },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentType = (formData.get("documentType") as DocumentType) ?? "OTHER";

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of 200 MB.` },
      { status: 413 }
    );
  }

  const validTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
    "image/tiff",
  ]);

  if (!validTypes.has(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} is not supported.` },
      { status: 415 }
    );
  }

  // Upload to storage
  const storage = createStorageProvider();
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileKey = `projects/${projectId}/documents/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
  await storage.upload(fileKey, fileBuffer, file.type);

  // Create DB record
  const document = await db.projectDocument.create({
    data: {
      projectId,
      filename: file.name,
      fileKey,
      fileSize: file.size,
      mimeType: file.type,
      documentType,
      authorityRank: AUTHORITY_RANKS[documentType] ?? 7,
    },
  });

  // Create a WorkerJob record for visibility
  await db.workerJob.create({
    data: {
      jobType: "document.ingest",
      sourceDocumentId: document.id,
      payload: { documentId: document.id },
    },
  });

  // Queue ingestion
  await ingestionQueue.add(
    "document.ingest",
    { documentId: document.id },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  await audit({
    userId,
    projectId,
    action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
    resourceType: "ProjectDocument",
    resourceId: document.id,
    metadata: { filename: file.name, documentType, fileSize: file.size },
  });

  return NextResponse.json(document, { status: 201 });
}
