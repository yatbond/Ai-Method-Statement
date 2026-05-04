import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import {
  normalizeImportFolderPath,
  canWriteRuntimeEnv,
  readEnvFile,
  readImportSources,
  updateEnvFile,
  writeImportSources,
  type TradeImportSource,
} from "@/lib/settings-files";
import { ingestionQueue } from "@/lib/queues";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "250");
  const limit = Math.max(50, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 250, 1000));
  const batchScope = searchParams.get("batchScope") === "all" ? "all" : "latest";
  const batchFilter = batchScope === "latest" ? await getLatestImportBatchFilter() : null;
  const jobWhere = {
    jobType: "historical-ms.ingest",
    ...(batchFilter?.where ?? {}),
  };

  const [trades, sources, env, totalJobs, statusCounts, jobs] = await Promise.all([
    db.trade.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { historicalMS: true, methodStatements: true } },
      },
    }),
    readImportSources(),
    readEnvFile(),
    db.workerJob.count({ where: jobWhere }),
    db.workerJob.groupBy({
      by: ["status"],
      where: jobWhere,
      _count: { id: true },
    }),
    db.workerJob.findMany({
      where: jobWhere,
      orderBy: { scheduledAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        payload: true,
        result: true,
        errorMessage: true,
        attempts: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  ]);

  const jobsWithQueueState = await attachQueueState(jobs);

  return NextResponse.json({
    trades,
    sources,
    envWritable: canWriteRuntimeEnv(),
    ingestionSettings: getIngestionSettings(env),
    jobs: jobsWithQueueState,
    jobMeta: {
      scope: batchScope,
      batch: batchFilter?.meta ?? null,
      limit,
      shown: jobsWithQueueState.length,
      total: totalJobs,
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count.id])),
    },
  });
}

async function getLatestImportBatchFilter() {
  const recentJobs = await db.workerJob.findMany({
    where: { jobType: "historical-ms.ingest" },
    orderBy: { scheduledAt: "desc" },
    take: 1000,
    select: { scheduledAt: true, payload: true },
  });
  const latestWithRunId = recentJobs.find((job) => typeof (job.payload as any)?.importRunId === "string");
  if (latestWithRunId) {
    const payload = latestWithRunId.payload as any;
    return {
      where: { payload: { path: ["importRunId"], equals: payload.importRunId } },
      meta: {
        id: payload.importRunId,
        mode: "exact",
        label: `Latest batch ${formatBatchTime(payload.importRunStartedAt ?? latestWithRunId.scheduledAt)}`,
        startedAt: payload.importRunStartedAt ?? latestWithRunId.scheduledAt.toISOString(),
        tradeId: payload.tradeId ?? null,
      },
    };
  }

  const latest = recentJobs[0];
  if (!latest) return null;
  const payload = latest.payload as any;
  const tradeId = typeof payload?.tradeId === "string" ? payload.tradeId : null;
  const windowStart = new Date(latest.scheduledAt.getTime() - 30 * 60 * 1000);
  return {
    where: {
      scheduledAt: { gte: windowStart },
      ...(tradeId ? { payload: { path: ["tradeId"], equals: tradeId } } : {}),
    },
    meta: {
      id: null,
      mode: "time-window",
      label: `Latest batch around ${formatBatchTime(latest.scheduledAt)}`,
      startedAt: windowStart.toISOString(),
      tradeId,
    },
  };
}

function formatBatchTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "recent run";
  return date.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Trade name is required." }, { status: 400 });
  }

  const trade = await db.trade.create({
    data: { name, description: description || null },
  });

  return NextResponse.json(trade, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (body.ingestionSettings) {
    const settings = body.ingestionSettings ?? {};
    const batchPages = clampInteger(settings.batchPages, 1, 100, 20);
    const requestDelaySeconds = clampInteger(settings.requestDelaySeconds, 0, 3600, 60);
    const parallelRequests = clampInteger(settings.parallelRequests, 1, 10, 3);

    const backupPath = await updateEnvFile({
      DOCUMENT_AI_BATCH_PAGES: String(batchPages),
      DOCUMENT_AI_REQUEST_DELAY_MS: String(requestDelaySeconds * 1000),
      INGESTION_CONCURRENCY: String(parallelRequests),
    });

    return NextResponse.json({
      ok: true,
      backupPath,
      ingestionSettings: {
        ...getIngestionSettings({
          DOCUMENT_AI_BATCH_PAGES: String(batchPages),
          DOCUMENT_AI_REQUEST_DELAY_MS: String(requestDelaySeconds * 1000),
          INGESTION_CONCURRENCY: String(parallelRequests),
        }),
        savedAt: new Date().toISOString(),
      },
      message: "Document AI settings saved to .env. Restart the worker before starting another import so PDF OCR uses the new limits.",
    });
  }

  const tradeId = String(body.tradeId ?? "");
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }

  if (body.folderPath !== undefined || body.enabled !== undefined) {
    const folderPath = normalizeImportFolderPath(String(body.folderPath ?? ""));
    const enabled = Boolean(body.enabled ?? true);
    const sources = await readImportSources();
    const existing = sources.find((source) => source.tradeId === tradeId);

    if (folderPath) {
      const stat = await fs.stat(folderPath).catch(() => null);
      if (!stat?.isDirectory()) {
        return NextResponse.json({ error: "Folder does not exist." }, { status: 400 });
      }
    }

    const nextSource: TradeImportSource = {
      tradeId,
      folderPath,
      enabled,
      updatedAt: new Date().toISOString(),
    };
    const nextSources = existing
      ? sources.map((source) => (source.tradeId === tradeId ? nextSource : source))
      : [...sources, nextSource];
    await writeImportSources(nextSources);
    return NextResponse.json(nextSource);
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Trade name is required." }, { status: 400 });
  }

  const trade = await db.trade.update({
    where: { id: tradeId },
    data: { name, description: description || null },
  });
  return NextResponse.json(trade);
}

function getIngestionSettings(env: Record<string, string>) {
  const batchPages = clampInteger(env.DOCUMENT_AI_BATCH_PAGES, 1, 100, 20);
  const requestDelayMs = clampInteger(env.DOCUMENT_AI_REQUEST_DELAY_MS, 0, 3_600_000, 60_000);
  const parallelRequests = clampInteger(env.INGESTION_CONCURRENCY, 1, 10, 3);
  const attempts = clampInteger(env.HISTORICAL_MS_INGEST_ATTEMPTS, 1, 10, 3);
  const retryDelaySeconds = clampInteger(env.HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS, 0, 86_400, 600);

  return {
    batchPages,
    requestDelaySeconds: Math.round(requestDelayMs / 1000),
    parallelRequests,
    attempts,
    retryDelaySeconds,
    adaptiveSplit: true,
    checkpointing: true,
    maxProviderPagesPerRequest: 100,
    maxProviderPdfMbPerRequest: 50,
    parallelRestartRequired: true,
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tradeId = searchParams.get("tradeId");
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }

  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    include: { _count: { select: { activities: true, historicalMS: true, methodStatements: true, tradePacks: true } } },
  });
  if (!trade) return NextResponse.json({ error: "Trade not found." }, { status: 404 });

  const linked =
    trade._count.activities +
    trade._count.historicalMS +
    trade._count.methodStatements +
    trade._count.tradePacks;
  if (linked > 0) {
    return NextResponse.json(
      { error: "Trade has linked records and cannot be deleted." },
      { status: 409 }
    );
  }

  await db.trade.delete({ where: { id: tradeId } });
  const sources = await readImportSources();
  await writeImportSources(sources.filter((source) => source.tradeId !== tradeId));

  return NextResponse.json({ ok: true });
}

type ImportWorkerJob = {
  id: string;
  status: string;
  payload: any;
  result: any;
  errorMessage: string | null;
  attempts: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

async function attachQueueState(jobs: ImportWorkerJob[]) {
  let activeQueueJobs: Awaited<ReturnType<typeof ingestionQueue.getJobs>> = [];
  try {
    activeQueueJobs = await ingestionQueue.getJobs(
      ["waiting", "active", "delayed", "paused", "prioritized", "waiting-children"],
      0,
      1000
    );
  } catch {
    activeQueueJobs = [];
  }

  return Promise.all(
    jobs.map(async (job) => {
      const payload = job.payload ?? {};
      const bullmqJobId = typeof payload.bullmqJobId === "string" ? payload.bullmqJobId : null;
      let queueJob = bullmqJobId ? await ingestionQueue.getJob(bullmqJobId).catch(() => null) : null;

      if (!queueJob) {
        queueJob =
          activeQueueJobs.find((candidate) => {
            if (candidate.name !== "historical-ms.ingest") return false;
            const candidateData = candidate.data ?? {};
            return (
              (payload.historicalMSId && candidateData.historicalMSId === payload.historicalMSId) ||
              (payload.fileKey && candidateData.fileKey === payload.fileKey)
            );
          }) ?? null;
      }

      const queueState = queueJob ? await queueJob.getState() : null;
      const queueCanCancel = queueState
        ? ["waiting", "active", "delayed", "paused", "prioritized", "waiting-children"].includes(queueState)
        : false;
      const progress =
        queueJob && typeof queueJob.progress === "number"
          ? queueJob.progress
          : job.status === "COMPLETE"
            ? 100
            : job.status === "CANCELLED" || job.status === "FAILED"
              ? null
              : 0;

      return {
        ...job,
        queue: {
          bullmqJobId: queueJob?.id ?? bullmqJobId,
          state: queueState,
          progress,
          canCancel: ["PENDING", "RUNNING", "RETRYING"].includes(job.status) || queueCanCancel,
        },
      };
    })
  );
}
