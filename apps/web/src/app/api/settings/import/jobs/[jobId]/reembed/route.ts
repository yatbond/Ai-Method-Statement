import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { embeddingQueue } from "@/lib/queues";
import { buildReembedQueueMessage } from "@/lib/import-indexing-status";
import { db, getRuntimeSettings } from "@ams/database";
import { REQUIRED_EMBEDDING_MODEL } from "@ams/shared";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const workerJob = await db.workerJob.findUnique({
    where: { id: jobId },
    select: { jobType: true, payload: true },
  });
  const historicalMSId = (workerJob?.payload as any)?.historicalMSId;
  if (workerJob?.jobType !== "historical-ms.ingest" || typeof historicalMSId !== "string") {
    return NextResponse.json({ error: "Historical import job not found." }, { status: 404 });
  }

  const runtimeSettings = await getRuntimeSettings(["GEMINI_EMBEDDING_MODEL"]);
  const modelVersion =
    runtimeSettings.GEMINI_EMBEDDING_MODEL ||
    process.env.GEMINI_EMBEDDING_MODEL ||
    REQUIRED_EMBEDDING_MODEL;

  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "SourcePassage"
    WHERE "historicalMSId" = ${historicalMSId}
      AND (embedding IS NULL OR "embeddingModelVersion" <> ${modelVersion})
    ORDER BY "createdAt" ASC
  `;
  const passageIds = rows.map((row) => row.id);
  const batchSize = 50;
  const queuedBatchCount = Math.ceil(passageIds.length / batchSize);
  for (let i = 0; i < passageIds.length; i += batchSize) {
    await embeddingQueue.add("document.embed", {
      passageIds: passageIds.slice(i, i + batchSize),
      modelVersion,
    });
  }

  return NextResponse.json({
    ok: true,
    queued: queuedBatchCount,
    passageCount: passageIds.length,
    modelVersion,
    message: buildReembedQueueMessage({
      passageCount: passageIds.length,
      queuedBatchCount,
      modelVersion,
    }),
  });
}
