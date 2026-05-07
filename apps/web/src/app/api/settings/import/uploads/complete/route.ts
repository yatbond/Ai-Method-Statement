import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { DocumentStatus, db } from "@ams/database";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";
import { createStorageProvider } from "@ams/storage";
import { getAuthUser } from "@/lib/auth";
import { ingestionQueue } from "@/lib/queues";
import { readEnvFile } from "@/lib/settings-files";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tradeId = typeof body.tradeId === "string" ? body.tradeId : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const fileKey = typeof body.fileKey === "string" ? body.fileKey : "";
  const mimeType = typeof body.contentType === "string" && body.contentType
    ? body.contentType
    : "application/pdf";
  const sourceFingerprint = typeof body.sourceFingerprint === "string" ? body.sourceFingerprint : "";
  const fileSize = Number(body.size ?? 0);
  const importRunId = typeof body.importRunId === "string" ? body.importRunId : crypto.randomUUID();
  const importRunStartedAt =
    typeof body.importRunStartedAt === "string" ? body.importRunStartedAt : new Date().toISOString();

  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are imported." }, { status: 400 });
  }
  if (!fileKey || !fileKey.startsWith(`knowledge-base/${tradeId}/`)) {
    return NextResponse.json({ error: "Invalid upload key." }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "File size is required." }, { status: 400 });
  }
  if (fileSize > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 200 MB." }, { status: 400 });
  }

  const trade = await db.trade.findUnique({ where: { id: tradeId } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  const storage = createStorageProvider();
  if (!(await storage.exists(fileKey))) {
    return NextResponse.json({ error: "Uploaded file was not found in storage." }, { status: 400 });
  }

  const existing = await db.workerJob.findFirst({
    where: {
      jobType: "historical-ms.ingest",
      status: { in: ["PENDING", "RUNNING", "COMPLETE"] },
      AND: [
        { payload: { path: ["tradeId"], equals: tradeId } },
        ...(sourceFingerprint
          ? [{ payload: { path: ["sourceFingerprint"], equals: sourceFingerprint } }]
          : [{ payload: { path: ["fileKey"], equals: fileKey } }]),
      ],
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return NextResponse.json({
      results: [
        {
          tradeId,
          file: filename,
          status: "skipped",
          message: `Already ${existing.status.toLowerCase()}.`,
        },
      ],
      queued: 0,
      skipped: 1,
      failed: 0,
      importRunId,
      importRunStartedAt,
    });
  }

  const env = await readEnvFile();
  const ingestAttempts = clampInteger(env.HISTORICAL_MS_INGEST_ATTEMPTS, 1, 10, 3);
  const retryDelaySeconds = clampInteger(env.HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS, 0, 86_400, 600);

  const ms = await db.historicalMethodStatement.create({
    data: {
      tradeId,
      title: path.basename(filename, path.extname(filename)),
      approvalStatus: DocumentStatus.QUEUED,
      fileKey,
      fileSize,
    },
  });

  const workerJob = await db.workerJob.create({
    data: {
      jobType: "historical-ms.ingest",
      payload: {
        historicalMSId: ms.id,
        fileKey,
        mimeType,
        tradeId,
        filename,
        sourceFingerprint: sourceFingerprint || undefined,
        importMode: "browser-direct-r2",
        importRunId,
        importRunStartedAt,
      },
    },
  });

  await ingestionQueue.add(
    "historical-ms.ingest",
    {
      workerJobId: workerJob.id,
      historicalMSId: ms.id,
      fileKey,
      mimeType,
      importRunId,
    },
    { jobId: workerJob.id, attempts: ingestAttempts, backoff: { type: "exponential", delay: retryDelaySeconds * 1000 } }
  );

  await db.workerJob.update({
    where: { id: workerJob.id },
    data: {
      payload: {
        ...(workerJob.payload as Record<string, any>),
        workerJobId: workerJob.id,
        bullmqJobId: workerJob.id,
      },
    },
  });

  return NextResponse.json({
    results: [{ tradeId, file: filename, status: "queued" }],
    queued: 1,
    skipped: 0,
    failed: 0,
    importRunId,
    importRunStartedAt,
  });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
