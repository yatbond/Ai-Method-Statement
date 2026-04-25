// =============================================================================
// Conflict Detection Engine (REQ-CON, Phase 4)
//
// Compares Pool A (project documents, authority ranks 1-5) against Pool B
// (retrieved historical precedents, rank 7) to surface contradictions.
//
// Source authority hierarchy is enforced: a project document ALWAYS prevails
// over a precedent. Conflicts are surfaced to the user — never silently resolved.
// The LLM must not assert which is "correct"; it reports the contradiction only.
// =============================================================================

import type { LLMProvider } from "../llm";

export type ConflictType =
  | "PROJECT_DOC_VS_PRECEDENT"
  | "DRAWING_VS_PRECEDENT"
  | "USER_INPUT_VS_RETRIEVED"
  | "PRECEDENT_VS_PRECEDENT";

export interface ConflictPassage {
  passageId: string;
  content: string;
  contentType: string;
  sourceRef: string;         // Human-readable reference for display
  authorityRank?: number;
  historicalMSId?: string;
}

export interface ConflictContext {
  trade: string;
  activity?: string;
  title: string;
  projectDocPassages: ConflictPassage[]; // Pool A
  precedentPassages: ConflictPassage[];  // Pool B
}

export interface DetectedConflict {
  conflictType: ConflictType;
  topic: string;
  currentRequirement: string;
  conflictingContent: string;
  currentSourceRef: string;
  conflictingSourceRef: string;
  precedentMSId?: string;
  recommendedAction: string;
}

export async function detectConflicts(
  context: ConflictContext,
  llm: LLMProvider
): Promise<DetectedConflict[]> {
  const poolAText = context.projectDocPassages
    .slice(0, 30)
    .map(
      (p) => `[${p.sourceRef}] (authority rank ${p.authorityRank ?? "?"}): ${p.content.slice(0, 500)}`
    )
    .join("\n\n");

  const poolBText = context.precedentPassages
    .slice(0, 20)
    .map((p) => `[${p.sourceRef}]: ${p.content.slice(0, 400)}`)
    .join("\n\n");

  const systemPrompt = `You are a conflict detection engine for construction method statements.
Your job is to identify genuine contradictions between current project requirements (Pool A)
and historical precedent method statements (Pool B).

RULES:
- Only report genuine contradictions — where the precedent says something different
  from the current project requirement on the same topic (e.g. different specification,
  different tolerance, different process).
- Do NOT report conflicts where the precedent simply lacks information.
- Do NOT suggest which is correct — only report the contradiction factually.
- Keep currentRequirement and conflictingContent as short factual quotes/paraphrases.
- Provide a recommendedAction that tells the user what decision to make (without deciding for them).
- Return 0 conflicts if no genuine contradictions exist.
- Maximum 10 conflicts.`;

  const userPrompt = `Method Statement: "${context.title}"
Trade: ${context.trade}
Activity: ${context.activity ?? "General"}

=== POOL A: Current Project Documents ===
${poolAText || "(no project documents)"}

=== POOL B: Historical Precedents ===
${poolBText || "(no precedents retrieved)"}

Identify conflicts where Pool B contradicts Pool A on the same technical topic.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "conflictType": "PROJECT_DOC_VS_PRECEDENT" | "DRAWING_VS_PRECEDENT" | "PRECEDENT_VS_PRECEDENT",
    "topic": "<short topic label, e.g. 'Concrete grade', 'Working hours'>",
    "currentRequirement": "<what Pool A says>",
    "conflictingContent": "<what Pool B says differently>",
    "currentSourceRef": "<[DOC-N] style reference>",
    "conflictingSourceRef": "<[PREC-N] style reference>",
    "recommendedAction": "<what the user needs to decide>"
  }
]`;

  const response = await llm.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 2048,
    temperature: 0.1,
  });

  let raw = response.content.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c: any) =>
          typeof c.topic === "string" &&
          typeof c.currentRequirement === "string" &&
          typeof c.conflictingContent === "string"
      )
      .slice(0, 10)
      .map((c: any) => ({
        conflictType: (c.conflictType ?? "PROJECT_DOC_VS_PRECEDENT") as ConflictType,
        topic: c.topic,
        currentRequirement: c.currentRequirement,
        conflictingContent: c.conflictingContent,
        currentSourceRef: c.currentSourceRef ?? "",
        conflictingSourceRef: c.conflictingSourceRef ?? "",
        precedentMSId: c.precedentMSId,
        recommendedAction: c.recommendedAction ?? "Review and decide which requirement applies.",
      }));
  } catch {
    return [];
  }
}
