// =============================================================================
// Drafting Engine (REQ-DRAFT, Phase 6)
//
// Generates section content from structured evidence (Pool A + Pool B + user
// answers). Enforces P1–P6 principles via DRAFTING_SYSTEM_PROMPT.
// Outputs markdown with [GAP: ...] markers where information is insufficient
// and [SRC:passage_id] citations after every fact.
// =============================================================================

import type { LLMProvider } from "../llm";
import { DRAFTING_SYSTEM_PROMPT } from "../llm";
import type { MethodStatementBrief, SectionKey } from "@ams/shared";

export interface SourcePassageForDraft {
  passageId: string;
  content: string;
  contentType: string;
  pageNumber?: number | null;
  sectionHeading?: string | null;
  sourceRef: string;
  pool: "A" | "B";
  authorityRank?: number;
}

export interface DraftContext {
  sectionKey: SectionKey;
  sectionTitle: string;
  methodStatementTitle: string;
  trade: string;
  activity?: string;
  brief: MethodStatementBrief;
  confirmedAnswers: Array<{ category: string; question: string; answer: string }>;
  passages: SourcePassageForDraft[];
  previousContent?: string;
}

export interface DraftResult {
  content: string;
  citedPassageIds: string[];
  gapCount: number;
}

// Section-specific drafting instructions
const SECTION_INSTRUCTIONS: Partial<Record<SectionKey, string>> = {
  cover: "Produce a cover sheet with: project name, method statement title, trade, revision, date, author, reviewer. Use only confirmed information — output [GAP: field] for any missing fields.",
  purpose: "Write 1–3 concise paragraphs stating the purpose and objectives of this method statement.",
  scope: "Clearly define what is included and explicitly excluded. List any geographic, temporal, or technical boundaries.",
  sequence: "Produce a numbered step-by-step construction sequence. Each step must be specific. Use [GAP: step details] where the source material is insufficient.",
  plant: "Produce a table of plant and equipment: | Item | Specification | Quantity | Purpose |. List all plant named in source documents.",
  materials: "Produce a table of materials: | Material | Specification/Standard | Quantity | Source |. Only list materials confirmed in documents.",
  labour: "Produce a table of labour: | Role | Competency requirement | Quantity | Responsibilities |.",
  safety: "List significant H&S risks with controls. Format: Risk → Control measure → Residual rating. Cite the risk assessment source for each.",
  qa_qc: "List inspection and test requirements as a table: | Activity | Standard/Spec ref | Hold/Witness | Acceptance criteria |.",
  environmental: "List environmental controls required. Reference the environmental management plan if cited in project documents.",
  permits: "List all permits, licences and consents required before and during the works.",
  temporary_works: "Describe temporary works requirements. State if a Temporary Works Design is required and cite the relevant specification.",
  emergency: "Describe emergency procedures and welfare arrangements. Include muster point, emergency contacts, and rescue plan.",
};

export async function draftSection(
  context: DraftContext,
  llm: LLMProvider
): Promise<DraftResult> {
  const poolBPassages = context.passages
    .filter((p) => p.pool === "B")
    .slice(0, 20);
  const poolAPassages = context.passages
    .filter((p) => p.pool === "A")
    .slice(0, 15);

  const poolBText = poolBPassages
    .map((p) => `[SRC:${p.passageId}] (${p.sourceRef}, ${p.contentType}): ${p.content.slice(0, 600)}`)
    .join("\n\n");

  const poolAText = poolAPassages
    .map((p) => `[SRC:${p.passageId}] (${p.sourceRef}): ${p.content.slice(0, 500)}`)
    .join("\n\n");

  const confirmedText = context.confirmedAnswers
    .map((a) => `${a.category.replace(/_/g, " ")}: ${a.answer}`)
    .join("\n");

  const briefSummary = [
    `Scope: ${context.brief.scopeSummary}`,
    context.brief.keyRisks.length > 0
      ? `Key risks: ${context.brief.keyRisks.join("; ")}`
      : null,
    context.brief.missingInformation.length > 0
      ? `Known gaps: ${context.brief.missingInformation.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const sectionInstruction =
    SECTION_INSTRUCTIONS[context.sectionKey] ??
    `Draft the "${context.sectionTitle}" section of the method statement.`;

  const userPrompt = `Method Statement: "${context.methodStatementTitle}"
Trade: ${context.trade}
Activity: ${context.activity ?? "General"}
Section: ${context.sectionTitle}

Brief summary:
${briefSummary || "(no brief yet)"}

Confirmed answers from gap analysis:
${confirmedText || "(none)"}

=== POOL B: Current Project Documents (highest authority — use first) ===
${poolBText || "(no project document passages)"}

=== POOL A: Historical Precedents (use only after confirming with Pool B) ===
${poolAText || "(no precedent passages)"}

${context.previousContent ? `Current draft (for revision):\n${context.previousContent}\n` : ""}

INSTRUCTION: ${sectionInstruction}

Output rules:
- Use markdown (headings, lists, tables as appropriate)
- Append [SRC:passage_id] after each sentence that draws on a specific source
- Output [GAP: description] where information is genuinely missing — never fabricate
- Do not add a section heading (it is rendered by the UI)
- Be specific and concise — no fluency padding`;

  const response = await llm.complete({
    messages: [
      { role: "system", content: DRAFTING_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 3000,
    temperature: 0.2,
  });

  const content = response.content.trim();

  // Extract cited passage IDs from [SRC:xxx] markers
  const srcRegex = /\[SRC:([a-z0-9]+)\]/gi;
  const citedPassageIds = Array.from(
    new Set(
      [...content.matchAll(srcRegex)].map((m) => m[1])
    )
  );

  // Count [GAP: ...] markers
  const gapCount = (content.match(/\[GAP:/g) ?? []).length;

  return { content, citedPassageIds, gapCount };
}

// ── Method Statement Brief generator (REQ-DRAFT-001) ──────────────────────────

export interface BriefInput {
  trade: string;
  activity?: string;
  title: string;
  projectDocuments: Array<{ id: string; title: string; type: string }>;
  retrievedPrecedents: Array<{
    historicalMSId: string;
    title: string;
    trade: string;
    retrievalReason: string;
    score: number;
  }>;
  confirmedAnswers: Array<{ category: string; question: string; answer: string }>;
  missingGapCategories: string[];
  unresolvedConflicts: string[];
}

export function buildMethodStatementBrief(input: BriefInput): MethodStatementBrief {
  const scopeAnswer = input.confirmedAnswers.find((a) => a.category === "scope");
  const sequenceAnswer = input.confirmedAnswers.find((a) => a.category === "sequence");
  const risksAnswer = input.confirmedAnswers.find((a) => a.category === "safety_risks");
  const qaAnswer = input.confirmedAnswers.find((a) => a.category === "qa_qc");

  return {
    proposedTitle: input.title,
    tradeAndActivity: input.activity ? `${input.trade} — ${input.activity}` : input.trade,
    scopeSummary: scopeAnswer?.answer ?? `${input.trade} works as described in project documents.`,
    projectDocumentReferences: input.projectDocuments.map((d) => ({
      documentId: d.id,
      title: d.title,
      type: d.type,
    })),
    retrievedPrecedents: input.retrievedPrecedents,
    keyApplicableRequirements: input.confirmedAnswers
      .filter((a) =>
        ["contract_references", "specification_references", "drawing_references"].includes(a.category)
      )
      .map((a) => `${a.category.replace(/_/g, " ")}: ${a.answer}`),
    proposedSequenceOutline: sequenceAnswer
      ? sequenceAnswer.answer.split(/\n|\d+\./).map((s) => s.trim()).filter(Boolean)
      : [],
    keyRisks: risksAnswer
      ? risksAnswer.answer.split(/\n/).map((s) => s.trim()).filter(Boolean)
      : [],
    keyQaQcItems: qaAnswer
      ? qaAnswer.answer.split(/\n/).map((s) => s.trim()).filter(Boolean)
      : [],
    missingInformation: input.missingGapCategories.map((c) => c.replace(/_/g, " ")),
    suggestedSelections: [],
    potentialConflicts: input.unresolvedConflicts,
    unresolvedItems: input.missingGapCategories.map((c) => c.replace(/_/g, " ")),
    sectionReadinessScores: {} as any,
  };
}
