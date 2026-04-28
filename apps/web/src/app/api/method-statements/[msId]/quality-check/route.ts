// =============================================================================
// Quality check API (REQ-EVAL, Phase 9)
//
// Runs static safety gates on all drafted sections and returns a report.
// Optionally runs LLM-based hallucination checks (slower, costs tokens).
//
// This is advisory — does not block export (gates are enforced in the export
// worker). Use to preview quality before triggering export.
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { runDocumentSafetyGates, extractClaims, checkClaims } from "@ams/ai-engine";
import { AnthropicLLMProvider } from "@ams/ai-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: {
      id: true,
      sections: {
        select: {
          sectionKey: true,
          sectionTitle: true,
          content: true,
          specificityScore: true,
        },
      },
      gapItems: {
        where: { status: { in: ["MISSING", "TO_BE_CONFIRMED"] } },
        select: { id: true },
      },
      conflicts: {
        where: { resolution: "UNRESOLVED" },
        select: { id: true },
      },
    },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const runHallucinationCheck = body.hallucinationCheck === true;

  // Gather all passage IDs currently available (so we can detect orphaned cites)
  const availablePassageIds = new Set(
    (
      await db.sourcePassage.findMany({
        where: {
          OR: [
            { sourceDocument: { project: { methodStatements: { some: { id: msId } } } } },
          ],
        },
        select: { id: true },
        take: 5000,
      })
    ).map((p) => p.id)
  );

  const sections = ms.sections.map((s) => {
    const content = s.content ?? "";
    const citedPassageIds = Array.from(
      new Set(
        [...content.matchAll(/\[SRC:([a-z0-9]+)\]/gi)].map((m) => m[1])
      )
    );
    return {
      sectionKey: s.sectionKey,
      sectionTitle: s.sectionTitle,
      content,
      specificityScore: s.specificityScore,
      citedPassageIds,
      availablePassageIds,
    };
  });

  const gateResult = runDocumentSafetyGates({
    sections,
    unresolvedGapCount: ms.gapItems.length,
    unresolvedConflictCount: ms.conflicts.length,
  });

  // Optional hallucination check (costs tokens)
  let hallucinationResults: any[] = [];
  if (runHallucinationCheck) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const llm = new AnthropicLLMProvider(apiKey);
      const allClaims = sections.flatMap((s) =>
        extractClaims(s.content).slice(0, 3) // max 3 claims per section to control cost
      );

      if (allClaims.length > 0) {
        const passages = await db.sourcePassage.findMany({
          where: { id: { in: allClaims.map((c) => c.passageId) } },
          select: { id: true, extractedText: true },
        });

        hallucinationResults = await checkClaims(
          allClaims.slice(0, 20), // max 20 claims total
          passages.map((p) => ({ passageId: p.id, content: p.extractedText })),
          llm
        );
      }
    }
  }

  return NextResponse.json({
    passed: gateResult.passed,
    blockers: gateResult.blockers,
    warnings: gateResult.warnings,
    hallucinationResults,
    summary: {
      unresolvedGaps: ms.gapItems.length,
      unresolvedConflicts: ms.conflicts.length,
      draftedSections: sections.filter((s) => s.content?.trim()).length,
      totalSections: ms.sections.length,
    },
  });
}
