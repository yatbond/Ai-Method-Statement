// =============================================================================
// Specificity analysis endpoint (REQ-SPEC, Phase 7)
//
// POST — analyse section content for generic phrases and return issues
//        with targeted questions and vocabulary suggestions
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { analyseSpecificity } from "@ams/ai-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string; sectionKey: string }> }
) {
  const { msId, sectionKey } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, tradeId: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { content } = await req.json() as { content: string };
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const result = analyseSpecificity(content);

  // Enrich with vocabulary terms from the DB for this trade
  const vocabularyTerms = await db.vocabularyTerm.findMany({
    where: {
      OR: [
        { tradeScope: { isEmpty: true } },
        { tradeScope: { has: ms.tradeId } },
      ],
    },
    select: { preferredTerm: true, prohibitedTerms: true, category: true },
  });

  // Add vocabulary hints to existing issues
  const enrichedIssues = result.issues.map((issue) => {
    const match = vocabularyTerms.find((vt) =>
      vt.prohibitedTerms.some((p) =>
        issue.phrase.toLowerCase().includes(p.toLowerCase())
      )
    );
    return {
      ...issue,
      preferredTerm: match?.preferredTerm ?? null,
      vocabularyCategory: match?.category ?? null,
    };
  });

  // Also flag vocabulary violations not already in issues
  const issuePositions = new Set(result.issues.map((i) => i.position));
  const lowerContent = content.toLowerCase();

  for (const vt of vocabularyTerms) {
    for (const prohibited of vt.prohibitedTerms) {
      const lowerProhibited = prohibited.toLowerCase();
      let searchFrom = 0;
      while (true) {
        const idx = lowerContent.indexOf(lowerProhibited, searchFrom);
        if (idx === -1) break;
        if (!issuePositions.has(idx)) {
          enrichedIssues.push({
            phrase: content.slice(idx, idx + prohibited.length),
            position: idx,
            question: `"${prohibited}" is not in the preferred vocabulary. Consider using "${vt.preferredTerm}" instead.`,
            category: vt.category,
            preferredTerm: vt.preferredTerm,
            vocabularyCategory: vt.category,
          });
          issuePositions.add(idx);
        }
        searchFrom = idx + 1;
      }
    }
  }

  // Update section's specificity score in DB
  await db.methodStatementSection.updateMany({
    where: { methodStatementId: msId, sectionKey },
    data: { specificityScore: result.score },
  });

  return NextResponse.json({
    score: result.score,
    issues: enrichedIssues,
    wordCount: content.split(/\s+/).filter(Boolean).length,
  });
}
