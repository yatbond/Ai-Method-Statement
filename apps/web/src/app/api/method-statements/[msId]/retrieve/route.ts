// =============================================================================
// Retrieval API for a method statement (REQ-RAG-001 to REQ-RAG-005)
//
// Runs hybrid retrieval against the KB and persists results as RetrievalResult
// records so the user can review and exclude irrelevant precedents.
// =============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import { retrieveRelevantPassages } from "@ams/ai-engine";
import { createEmbeddingProvider } from "@ams/ai-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: {
      id: msId,
      project: { members: { some: { userId } } },
    },
    select: {
      id: true,
      tradeId: true,
      activityId: true,
      title: true,
      project: { select: { id: true } },
    },
  });

  if (!ms) return NextResponse.json({ error: "Method statement not found." }, { status: 404 });

  const body = await req.json();
  const {
    query = ms.title,
    crossTradeOptIn = false,
    includeImages = true,
    includeTables = true,
    limit = 10,
  } = body;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Cannot run retrieval." },
      { status: 503 }
    );
  }

  const embeddingProvider = createEmbeddingProvider({
    provider: "gemini",
    apiKey,
    modelVersion: process.env.GEMINI_EMBEDDING_MODEL,
  });

  const hits = await retrieveRelevantPassages(
    {
      query,
      tradeId: ms.tradeId,
      activityId: ms.activityId ?? undefined,
      methodStatementId: ms.id,
      crossTradeOptIn,
      includeImages,
      includeTables,
      limit,
      modelVersion: process.env.GEMINI_EMBEDDING_MODEL,
      projectId: ms.project.id,
    },
    db,
    embeddingProvider
  );

  // Persist retrieval results (REQ-RAG-003: reasons stored for display)
  // Upsert to support re-running retrieval
  await db.retrievalResult.deleteMany({ where: { methodStatementId: msId } });

  for (const hit of hits) {
    if (!hit.historicalMSId) continue;
    await db.retrievalResult.create({
      data: {
        methodStatementId: msId,
        historicalMSId: hit.historicalMSId,
        score: hit.rrfScore,
        reason: hit.reason,
        excluded: false,
      },
    });
  }

  return NextResponse.json({ hits, count: hits.length });
}

// GET — return previously computed retrieval results
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await db.retrievalResult.findMany({
    where: { methodStatementId: msId },
    orderBy: { score: "desc" },
    include: {
      historicalMethodStatement: {
        select: {
          id: true,
          title: true,
          projectName: true,
          client: true,
          approvalStatus: true,
          tags: { select: { key: true, value: true } },
          trade: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json(results);
}

// PATCH — user excludes or un-excludes a retrieval result
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { resultId, excluded } = await req.json();

  await db.retrievalResult.update({
    where: { id: resultId },
    data: { excluded },
  });

  return NextResponse.json({ ok: true });
}
