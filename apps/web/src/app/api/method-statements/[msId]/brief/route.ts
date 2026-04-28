// =============================================================================
// Method Statement Brief API (REQ-DRAFT-001, Phase 6)
//
// GET  — return the current brief (null if not yet generated)
// POST — generate/regenerate the brief from current gap answers and retrieval
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { buildMethodStatementBrief } from "@ams/ai-engine";
import { audit } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, briefContent: true, briefGenerated: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ brief: ms.briefContent, generated: ms.briefGenerated });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    include: {
      trade: { select: { name: true } },
      activity: { select: { name: true } },
      project: {
        select: {
          documents: {
            select: { id: true, title: true, documentType: true, authorityRank: true },
            orderBy: { authorityRank: "asc" },
            take: 20,
          },
        },
      },
      gapItems: {
        where: { status: { in: ["CONFIRMED_BY_USER", "CONFIRMED_BY_DOCUMENT"] } },
        select: { category: true, question: true, answer: true },
      },
      gapItems_missing: {
        select: { category: true },
        where: { status: { in: ["MISSING", "TO_BE_CONFIRMED"] } },
      } as any,
      conflicts: {
        where: { resolution: "UNRESOLVED" },
        select: { topic: true },
      },
      retrievals: {
        where: { excluded: false },
        include: {
          historicalMethodStatement: {
            select: { id: true, title: true, trade: { select: { name: true } } },
          },
        },
        take: 10,
      },
    },
  });

  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Get missing gap categories
  const missingGaps = await db.gapItem.findMany({
    where: {
      methodStatementId: msId,
      status: { in: ["MISSING", "TO_BE_CONFIRMED"] },
    },
    select: { category: true },
    distinct: ["category"],
  });

  const brief = buildMethodStatementBrief({
    trade: ms.trade.name,
    activity: ms.activity?.name,
    title: ms.title,
    projectDocuments: ms.project.documents.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.documentType,
    })),
    retrievedPrecedents: ms.retrievals.map((r) => ({
      historicalMSId: r.historicalMSId,
      title: r.historicalMethodStatement.title,
      trade: r.historicalMethodStatement.trade.name,
      retrievalReason: r.reason,
      score: r.score,
    })),
    confirmedAnswers: ms.gapItems.map((g) => ({
      category: g.category,
      question: g.question,
      answer: g.answer ?? "",
    })),
    missingGapCategories: missingGaps.map((g) => g.category),
    unresolvedConflicts: ms.conflicts.map((c) => c.topic),
  });

  await db.methodStatement.update({
    where: { id: msId },
    data: { briefContent: brief as any, briefGenerated: true },
  });

  await audit({
    userId,
    action: "brief.generated",
    resourceType: "MethodStatement",
    resourceId: msId,
    metadata: { title: ms.title },
  });

  return NextResponse.json({ brief, generated: true });
}
