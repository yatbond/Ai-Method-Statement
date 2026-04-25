// =============================================================================
// Gap Analysis Engine (REQ-GAP, Phase 3)
//
// Analyses a method statement against project documents and historical
// precedents to identify what information is confirmed, suggested, or missing.
//
// Source authority enforced: project docs (Pool A) always take precedence over
// historical precedents (Pool B). AI MUST NOT assert technical facts —
// it only classifies what evidence exists, never invents answers.
// =============================================================================

import type { LLMProvider } from "../llm";
import { GAP_CATEGORIES, type GapCategory, type GapStatus } from "@ams/shared";

export interface PassageContext {
  passageId: string;
  content: string;
  contentType: string;
  sectionHeading?: string | null;
  pageNumber?: number | null;
  authorityRank?: number;
  sourceDocumentTitle?: string;
  historicalMSTitle?: string;
}

export interface GapAnalysisContext {
  methodStatementId: string;
  trade: string;
  activity?: string;
  title: string;
  existingConfirmedAnswers: Array<{
    category: string;
    question: string;
    answer: string;
  }>;
  projectDocPassages: PassageContext[]; // Pool A
  precedentPassages: PassageContext[];  // Pool B
}

export interface DetectedGap {
  category: GapCategory;
  question: string;
  status: GapStatus;
  answer?: string;
  sourceDocumentRef?: string;
}

const GAP_QUESTION_HINTS: Record<GapCategory, string> = {
  scope:                  "What work is included and explicitly excluded from this method statement?",
  work_location:          "Where exactly is the work taking place (grid lines, levels, zones, access points)?",
  sequence:               "What is the step-by-step construction sequence including hold/witness points?",
  plant:                  "What plant and equipment is required, including capacities and quantities?",
  labour:                 "What labour resource is needed (supervisors, operatives, competency requirements)?",
  materials:              "What materials, products or pre-formed elements are required with specs/standards?",
  permits:                "What permits, consents or licences are required before and during the works?",
  temporary_works:        "What temporary works are required and are design certificates needed?",
  access_logistics:       "How will plant, materials and personnel access the work area?",
  programme_constraints:  "What are the programme dates, phasing constraints or sectional completion dates?",
  safety_risks:           "What significant health and safety risks have been identified and controlled?",
  environmental_controls: "What environmental controls are required (noise, dust, water, waste, vibration)?",
  qa_qc:                  "What inspection and testing is required and what are the acceptance criteria?",
  hold_witness_points:    "What hold points and witness points must be observed before progressing?",
  monitoring:             "What monitoring or instrumentation requirements apply during the works?",
  emergency_procedures:   "What are the emergency procedures and welfare arrangements for this activity?",
  interfaces:             "What interfaces with other trades, third parties or existing services exist?",
  contract_references:    "Which contract clauses, schedules or NEC3/NEC4 requirements apply?",
  specification_references: "Which specifications, standards or codes of practice apply?",
  drawing_references:     "Which drawings must be consulted and what are the latest revision numbers?",
  roles_responsibilities: "Who is responsible for each key role (PM, RE, SM, QA, Designer)?",
  other:                  "Is there any other critical information required to safely execute this work?",
};

export async function detectGaps(
  context: GapAnalysisContext,
  llm: LLMProvider
): Promise<DetectedGap[]> {
  // Summarise Pool A passages (project docs, high authority)
  const poolAText = context.projectDocPassages
    .slice(0, 40)
    .map(
      (p, i) =>
        `[DOC-${i + 1}] ${p.sourceDocumentTitle ?? "Project document"} p.${p.pageNumber ?? "?"}: ${p.content.slice(0, 500)}`
    )
    .join("\n\n");

  // Summarise Pool B passages (historical precedents)
  const poolBText = context.precedentPassages
    .slice(0, 20)
    .map(
      (p, i) =>
        `[PREC-${i + 1}] ${p.historicalMSTitle ?? "Precedent"}: ${p.content.slice(0, 400)}`
    )
    .join("\n\n");

  const alreadyConfirmed = context.existingConfirmedAnswers
    .map((a) => `${a.category}: ${a.question} → ${a.answer}`)
    .join("\n");

  const systemPrompt = `You are a gap analysis engine for construction method statements.
Your job is to determine whether each required information category is:
- CONFIRMED_BY_DOCUMENT: clearly answered in a project document (Pool A)
- SUGGESTED_FROM_PRECEDENT: a precedent document (Pool B) provides a plausible answer to suggest to the user
- MISSING: no relevant information found in either source
- TO_BE_CONFIRMED: partial information exists but needs clarification

RULES:
- NEVER invent technical facts. Only classify what the provided documents say.
- Pool A (project documents) takes precedence over Pool B (precedents).
- If a Pool A document answers the question, status is CONFIRMED_BY_DOCUMENT.
- If only Pool B has an answer, status is SUGGESTED_FROM_PRECEDENT (user must confirm).
- Keep answers short and factual — quote or paraphrase the source; do not elaborate.
- For CONFIRMED_BY_DOCUMENT, cite the source reference (e.g. "[DOC-3] p.12").
- For SUGGESTED_FROM_PRECEDENT, cite the precedent reference (e.g. "[PREC-2]").
- Only flag MISSING/TO_BE_CONFIRMED when genuinely absent — do not ask trivial questions.
- Skip NOT_APPLICABLE where the category clearly doesn't apply to this trade/activity.`;

  const userPrompt = `Method Statement: "${context.title}"
Trade: ${context.trade}
Activity: ${context.activity ?? "General"}

Already confirmed:
${alreadyConfirmed || "(none yet)"}

=== POOL A: Project Documents ===
${poolAText || "(no project documents uploaded yet)"}

=== POOL B: Historical Precedents ===
${poolBText || "(no precedents retrieved yet)"}

Analyse each gap category below and return a JSON array of DetectedGap objects.
Only include categories where information is genuinely needed (omit trivially obvious N/A ones).

Categories to analyse:
${GAP_CATEGORIES.filter((c) => c !== "other").map((c) => `- ${c}: ${GAP_QUESTION_HINTS[c]}`).join("\n")}

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "category": "<one of the category keys>",
    "question": "<specific question tailored to this trade/activity>",
    "status": "CONFIRMED_BY_DOCUMENT" | "SUGGESTED_FROM_PRECEDENT" | "MISSING" | "TO_BE_CONFIRMED",
    "answer": "<factual answer text, or null if MISSING>",
    "sourceDocumentRef": "<[DOC-N] or [PREC-N] reference, or null>"
  }
]`;

  const response = await llm.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 4096,
    temperature: 0.1,
  });

  let raw = response.content.trim();
  // Strip markdown code fences if present
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let gaps: DetectedGap[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    gaps = parsed
      .filter(
        (g: any) =>
          typeof g.category === "string" &&
          GAP_CATEGORIES.includes(g.category as GapCategory) &&
          typeof g.question === "string" &&
          typeof g.status === "string"
      )
      .map((g: any) => ({
        category: g.category as GapCategory,
        question: g.question,
        status: g.status as GapStatus,
        answer: g.answer ?? undefined,
        sourceDocumentRef: g.sourceDocumentRef ?? undefined,
      }));
  } catch {
    // Fallback: return all categories as MISSING if LLM output was malformed
    gaps = GAP_CATEGORIES.filter((c) => c !== "other").map((c) => ({
      category: c,
      question: GAP_QUESTION_HINTS[c],
      status: "MISSING" as GapStatus,
    }));
  }

  return gaps;
}
