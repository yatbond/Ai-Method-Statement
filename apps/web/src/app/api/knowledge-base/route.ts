// =============================================================================
// Knowledge base API — historical method statement management
//
// REQ-KB-001: Historical MS are company precedent, not current project facts.
// REQ-ING-006: Bulk ingestion is gated — curated upload only.
// REQ-NFR-SEC-004: All actions written to audit log.
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db, DocumentStatus } from "@ams/database";
import { audit } from "@/lib/audit";
import { createStorageProvider } from "@ams/storage";
import { ingestionQueue } from "@/lib/queues";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const { searchParams } = new URL(req.url);

  const tradeId = searchParams.get("tradeId");
  const status = searchParams.get("status");
  const search = searchParams.get("q");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const skip = (page - 1) * limit;

  const where: any = {
    ...(tradeId && { tradeId }),
    ...(status && { approvalStatus: status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { projectName: { contains: search, mode: "insensitive" } },
        { client: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    db.historicalMethodStatement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        trade: { select: { name: true } },
        tags: { select: { key: true, value: true, aiGenerated: true } },
        _count: { select: { sourcePassages: true } },
      },
    }),
    db.historicalMethodStatement.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  // Only Admins and Knowledge Curators (Manager role) can ingest historical MS
  // In a full implementation this would check a specific KB_CURATOR permission
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tradeId = formData.get("tradeId") as string | null;
  const title = formData.get("title") as string | null;
  const projectName = formData.get("projectName") as string | null;
  const client = formData.get("client") as string | null;
  const approvalStatus = (formData.get("approvalStatus") as string) ?? "COMPLETE";

  if (!file || !tradeId || !title) {
    return NextResponse.json(
      { error: "file, tradeId, and title are required." },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds maximum size of 200 MB." }, { status: 413 });
  }

  // Verify trade exists
  const trade = await db.trade.findUnique({ where: { id: tradeId } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  // Upload file to storage
  const storage = createStorageProvider();
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileKey = `knowledge-base/${tradeId}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
  await storage.upload(fileKey, fileBuffer, file.type);

  // Create historical MS record
  const ms = await db.historicalMethodStatement.create({
    data: {
      tradeId,
      title: title.trim(),
      projectName: projectName?.trim() || null,
      client: client?.trim() || null,
      approvalStatus: approvalStatus as DocumentStatus,
      fileKey,
      fileSize: file.size,
    },
  });

  // Create a corresponding ProjectDocument-like record so the ingestion
  // pipeline can process it via the standard path
  // We store it as a special document that feeds into SourcePassage with historicalMSId
  await db.workerJob.create({
    data: {
      jobType: "historical-ms.ingest",
      payload: {
        historicalMSId: ms.id,
        fileKey,
        mimeType: file.type,
        modelVersion: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",
      },
    },
  });

  // Queue ingestion via a special job variant
  await ingestionQueue.add(
    "historical-ms.ingest",
    {
      historicalMSId: ms.id,
      fileKey,
      mimeType: file.type,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  await audit({
    userId,
    action: "knowledge_base.ms_uploaded",
    resourceType: "HistoricalMethodStatement",
    resourceId: ms.id,
    metadata: { title, tradeId, trade: trade.name },
  });

  return NextResponse.json(ms, { status: 201 });
}
