// =============================================================================
// Hallucination checker (REQ-EVAL, Phase 9)
//
// Verifies that sentences citing a passage [SRC:id] are actually supported
// by that passage's content. Uses LLM-as-judge with a strict prompt.
//
// This is a post-draft quality check, not a realtime gate.
// Results are advisory — the engineer decides whether to accept or rework.
// =============================================================================

import type { LLMProvider } from "../llm";

export interface PassageForCheck {
  passageId: string;
  content: string;
}

export interface HallucinationCheckResult {
  supported: boolean;
  claim: string;
  passageId: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
}

// Extract (claim, passageId) pairs from drafted content
export function extractClaims(content: string): Array<{ claim: string; passageId: string }> {
  const claims: Array<{ claim: string; passageId: string }> = [];

  // Match sentences ending with [SRC:passage_id]
  const sentencePattern = /([^.!?\n][^.!?\n]*?)\[SRC:([a-z0-9]+)\]/gi;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(content)) !== null) {
    const claim = match[1].trim();
    const passageId = match[2];
    if (claim.length > 20) {
      claims.push({ claim, passageId });
    }
  }

  return claims;
}

export async function checkClaims(
  claims: Array<{ claim: string; passageId: string }>,
  passages: PassageForCheck[],
  llm: LLMProvider
): Promise<HallucinationCheckResult[]> {
  const passageMap = new Map(passages.map((p) => [p.passageId, p.content]));
  const results: HallucinationCheckResult[] = [];

  // Batch: check up to 5 claims per LLM call to keep cost low
  const batchSize = 5;
  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);

    const checklist = batch
      .map((c, idx) => {
        const passage = passageMap.get(c.passageId);
        return `CLAIM ${idx + 1}: "${c.claim}"
SOURCE ${idx + 1} [${c.passageId}]: "${(passage ?? "(passage not found)").slice(0, 400)}"`;
      })
      .join("\n\n");

    const systemPrompt = `You are a hallucination detector for construction method statements.
For each CLAIM/SOURCE pair, determine if the source passage actually supports the claim.
Be strict: if the source does not explicitly state or directly imply the claim, mark it unsupported.`;

    const userPrompt = `${checklist}

Return a JSON array with one object per claim (in order):
[
  {
    "claimIndex": 1,
    "supported": true | false,
    "confidence": "high" | "medium" | "low",
    "explanation": "<one sentence explaining the decision>"
  }
]`;

    try {
      const response = await llm.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 800,
        temperature: 0,
      });

      let raw = response.content.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      const parsed: any[] = JSON.parse(raw);

      for (let j = 0; j < batch.length; j++) {
        const c = batch[j];
        const r = parsed[j];
        results.push({
          supported: r?.supported ?? false,
          claim: c.claim,
          passageId: c.passageId,
          explanation: r?.explanation ?? "Could not verify.",
          confidence: r?.confidence ?? "low",
        });
      }
    } catch {
      // On parse failure, mark all in batch as unverifiable
      for (const c of batch) {
        results.push({
          supported: false,
          claim: c.claim,
          passageId: c.passageId,
          explanation: "Could not verify — LLM output was malformed.",
          confidence: "low",
        });
      }
    }
  }

  return results;
}
