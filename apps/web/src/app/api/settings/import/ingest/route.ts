import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { DocumentStatus, db } from "@ams/database";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";
import { createStorageProvider } from "@ams/storage";
import { getAuthUser } from "@/lib/auth";
import { ingestionQueue } from "@/lib/queues";
import { readEnvFile, readImportSources } from "@/lib/settings-files";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleUploadedImport(req);
  }

  const body = await req.json().catch(() => ({}));
  const requestedTradeId = typeof body.tradeId === "string" ? body.tradeId : null;
  const importRunId = crypto.randomUUID();
  const importRunStartedAt = new Date().toISOString();

  const sources = (await readImportSources()).filter(
    (source) => source.enabled && source.folderPath && (!requestedTradeId || source.tradeId === requestedTradeId)
  );

  if (requestedTradeId && sources.length === 0) {
    return NextResponse.json(
      { error: "No saved source folder is configured for this trade." },
      { status: 400 }
    );
  }

  const storage = createStorageProvider();
  const env = await readEnvFile();
  const ingestAttempts = clampInteger(env.HISTORICAL_MS_INGEST_ATTEMPTS, 1, 10, 3);
  const retryDelaySeconds = clampInteger(env.HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS, 0, 86_400, 600);
  const results: Array<{
    tradeId: string;
    file: string;
    status: "queued" | "skipped" | "failed";
    message?: string;
  }> = [];

  for (const source of sources) {
    const trade = await db.trade.findUnique({ where: { id: source.tradeId } });
    if (!trade) {
      results.push({ tradeId: source.tradeId, file: source.folderPath, status: "failed", message: "Trade not found." });
      continue;
    }

    const entries = await fs.readdir(source.folderPath, { withFileTypes: true }).catch((error: any) => {
      results.push({ tradeId: source.tradeId, file: source.folderPath, status: "failed", message: error.message });
      return [];
    });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;

      const localSourcePath = path.join(source.folderPath, entry.name);
      const existing = await db.workerJob.findFirst({
        where: {
          jobType: "historical-ms.ingest",
          status: { in: ["PENDING", "RUNNING", "COMPLETE"] },
          payload: { path: ["localSourcePath"], equals: localSourcePath },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        results.push({
          tradeId: source.tradeId,
          file: entry.name,
          status: "skipped",
          message: `Already ${existing.status.toLowerCase()}.`,
        });
        continue;
      }

      try {
        const stat = await fs.stat(localSourcePath);
        if (stat.size > MAX_UPLOAD_SIZE_BYTES) {
          results.push({ tradeId: source.tradeId, file: entry.name, status: "failed", message: "File exceeds 200 MB." });
          continue;
        }

        const fileBuffer = await fs.readFile(localSourcePath);
        const safeName = entry.name.replace(/[^a-z0-9._-]/gi, "_");
        const fileKey = `knowledge-base/${source.tradeId}/${Date.now()}-${safeName}`;
        await storage.upload(fileKey, fileBuffer, "application/pdf");

        const ms = await db.historicalMethodStatement.create({
          data: {
            tradeId: source.tradeId,
            title: path.basename(entry.name, path.extname(entry.name)),
            approvalStatus: DocumentStatus.QUEUED,
            fileKey,
            fileSize: stat.size,
          },
        });

        const workerJob = await db.workerJob.create({
          data: {
            jobType: "historical-ms.ingest",
            payload: {
              historicalMSId: ms.id,
              fileKey,
              mimeType: "application/pdf",
              localSourcePath,
              tradeId: source.tradeId,
              filename: entry.name,
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
            mimeType: "application/pdf",
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
              importRunId,
              importRunStartedAt,
            },
          },
        });

        results.push({ tradeId: source.tradeId, file: entry.name, status: "queued" });
      } catch (error: any) {
        results.push({ tradeId: source.tradeId, file: entry.name, status: "failed", message: error.message });
      }
    }
  }

  return NextResponse.json({
    results,
    queued: results.filter((result) => result.status === "queued").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    importRunId,
    importRunStartedAt,
    message:
      results.length === 0
        ? "No PDF files were found in the enabled source folders."
        : undefined,
  });
}

async function handleUploadedImport(req: Request) {
  const formData = await req.formData();
  const tradeId = String(formData.get("tradeId") ?? "");
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);
  const importRunId = crypto.randomUUID();
  const importRunStartedAt = new Date().toISOString();

  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one PDF file to import." }, { status: 400 });
  }

  const trade = await db.trade.findUnique({ where: { id: tradeId } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  const storage = createStorageProvider();
  const env = await readEnvFile();
  const ingestAttempts = clampInteger(env.HISTORICAL_MS_INGEST_ATTEMPTS, 1, 10, 3);
  const retryDelaySeconds = clampInteger(env.HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS, 0, 86_400, 600);
  const results: Array<{
    tradeId: string;
    file: string;
    status: "queued" | "skipped" | "failed";
    message?: string;
  }> = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      results.push({ tradeId, file: file.name, status: "skipped", message: "Only PDF files are imported." });
      continue;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      results.push({ tradeId, file: file.name, status: "failed", message: "File exceeds 200 MB." });
      continue;
    }

    try {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const sourceFingerprint = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      const existing = await db.workerJob.findFirst({
        where: {
          jobType: "historical-ms.ingest",
          status: { in: ["PENDING", "RUNNING", "COMPLETE"] },
          AND: [
            { payload: { path: ["tradeId"], equals: tradeId } },
            { payload: { path: ["sourceFingerprint"], equals: sourceFingerprint } },
          ],
        },
        select: { id: true, status: true },
      });
      if (existing) {
        results.push({
          tradeId,
          file: file.name,
          status: "skipped",
          message: `Already ${existing.status.toLowerCase()}.`,
        });
        continue;
      }

      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const fileKey = `knowledge-base/${tradeId}/${Date.now()}-${safeName}`;
      await storage.upload(fileKey, fileBuffer, file.type || "application/pdf");

      const ms = await db.historicalMethodStatement.create({
        data: {
          tradeId,
          title: path.basename(file.name, path.extname(file.name)),
          approvalStatus: DocumentStatus.QUEUED,
          fileKey,
          fileSize: file.size,
        },
      });

      const workerJob = await db.workerJob.create({
        data: {
          jobType: "historical-ms.ingest",
          payload: {
            historicalMSId: ms.id,
            fileKey,
            mimeType: file.type || "application/pdf",
            tradeId,
            filename: file.name,
            sourceFingerprint,
            importMode: "browser-upload",
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
          mimeType: file.type || "application/pdf",
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

      results.push({ tradeId, file: file.name, status: "queued" });
    } catch (error: any) {
      results.push({ tradeId, file: file.name, status: "failed", message: error.message });
    }
  }

  return NextResponse.json({
    results,
    queued: results.filter((result) => result.status === "queued").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    importRunId,
    importRunStartedAt,
    message:
      results.length === 0
        ? "No PDF files were selected."
        : undefined,
  });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
