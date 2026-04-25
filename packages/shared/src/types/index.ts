// =============================================================================
// Shared TypeScript types for AI Method Statement Studio
// =============================================================================

// ── Source Authority ──────────────────────────────────────────────────────────

export type AuthorityRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const AUTHORITY_RANK_LABELS: Record<AuthorityRank, string> = {
  1: "Current project contract documents",
  2: "Current project specifications",
  3: "Current project drawings",
  4: "Current project safety / risk requirements",
  5: "Current project programme and site constraints",
  6: "User-confirmed answers",
  7: "Approved historical method statements",
  8: "Company standard clauses",
  9: "AI general knowledge",
};

// ── Gap Analysis ──────────────────────────────────────────────────────────────

export type GapStatus =
  | "CONFIRMED_BY_DOCUMENT"
  | "CONFIRMED_BY_USER"
  | "SUGGESTED_FROM_PRECEDENT"
  | "CONFLICT"
  | "NOT_APPLICABLE"
  | "TO_BE_CONFIRMED"
  | "MISSING";

export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  CONFIRMED_BY_DOCUMENT: "Confirmed by document",
  CONFIRMED_BY_USER: "Confirmed by user",
  SUGGESTED_FROM_PRECEDENT: "Suggested from precedent",
  CONFLICT: "Conflict",
  NOT_APPLICABLE: "Not applicable",
  TO_BE_CONFIRMED: "To be confirmed",
  MISSING: "Missing",
};

export const GAP_STATUS_COLOR: Record<GapStatus, string> = {
  CONFIRMED_BY_DOCUMENT: "green",
  CONFIRMED_BY_USER: "green",
  SUGGESTED_FROM_PRECEDENT: "amber",
  CONFLICT: "red",
  NOT_APPLICABLE: "gray",
  TO_BE_CONFIRMED: "blue",
  MISSING: "red",
};

// ── Conflict Resolution ───────────────────────────────────────────────────────

export type ConflictResolution =
  | "ACCEPT_CURRENT"
  | "ACCEPT_PRECEDENT"
  | "MANUAL_EDIT"
  | "UNRESOLVED"
  | "EXCLUDED";

// ── Section Keys (standard structure) ────────────────────────────────────────

export const STANDARD_SECTION_KEYS = [
  "cover",
  "document_control",
  "purpose",
  "scope",
  "references",
  "definitions",
  "roles",
  "location",
  "plant",
  "materials",
  "labour",
  "permits",
  "pre_commencement",
  "sequence",
  "temporary_works",
  "safety",
  "environmental",
  "qa_qc",
  "hold_points",
  "interfaces",
  "emergency",
  "housekeeping",
  "records",
  "appendices",
] as const;

export type SectionKey = (typeof STANDARD_SECTION_KEYS)[number];

// ── Gap Categories ────────────────────────────────────────────────────────────

export const GAP_CATEGORIES = [
  "scope",
  "work_location",
  "sequence",
  "plant",
  "labour",
  "materials",
  "permits",
  "temporary_works",
  "access_logistics",
  "programme_constraints",
  "safety_risks",
  "environmental_controls",
  "qa_qc",
  "hold_witness_points",
  "monitoring",
  "emergency_procedures",
  "interfaces",
  "contract_references",
  "specification_references",
  "drawing_references",
  "roles_responsibilities",
  "other",
] as const;

export type GapCategory = (typeof GAP_CATEGORIES)[number];

// ── Method Statement Brief (REQ-DRAFT-001) ────────────────────────────────────

export interface MethodStatementBrief {
  proposedTitle: string;
  tradeAndActivity: string;
  scopeSummary: string;
  projectDocumentReferences: DocumentReference[];
  retrievedPrecedents: PrecedentReference[];
  keyApplicableRequirements: string[];
  proposedSequenceOutline: string[];
  keyRisks: string[];
  keyQaQcItems: string[];
  missingInformation: string[];
  suggestedSelections: SuggestedSelection[];
  potentialConflicts: string[];
  unresolvedItems: string[];
  sectionReadinessScores: Record<SectionKey, number>; // 0–100
}

export interface DocumentReference {
  documentId: string;
  title: string;
  type: string;
  pageReference?: string;
}

export interface PrecedentReference {
  historicalMSId: string;
  title: string;
  trade: string;
  retrievalReason: string;
  score: number;
}

export interface SuggestedSelection {
  gapCategory: GapCategory;
  question: string;
  suggestion: string;
  sourceReference: string;
  status: GapStatus;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export interface RetrievalQuery {
  text: string;
  tradeId: string;
  activityId?: string;
  includeImages?: boolean;
  includeTables?: boolean;
  crossTradeOptIn?: boolean;
  limit?: number;
}

export interface RetrievalHit {
  passageId: string;
  score: number;
  content: string;
  contentType: "text" | "table" | "image" | "diagram";
  sourceDocumentId?: string;
  historicalMSId?: string;
  pageNumber?: number;
  sectionHeading?: string;
  reason: string;
}

// ── Specificity ───────────────────────────────────────────────────────────────

export interface SpecificityIssue {
  phrase: string;
  position: number;
  question: string;
  category: string;
}

export interface SpecificityResult {
  score: number; // 0–100
  issues: SpecificityIssue[];
}

// ── Visual Generation ─────────────────────────────────────────────────────────

export type VisualType = "TABLE" | "CHART" | "DIAGRAM" | "GRAPHIC";

export interface TableDefinition {
  title: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface DiagramDefinition {
  type: "sequence" | "swimlane" | "decision" | "process";
  mermaidSource: string;
  title?: string;
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  includeAppendixA: boolean;
  includeAppendixB: boolean;
  includeUnresolvedItemsAppendix: boolean;
}

export interface PreExportSummary {
  unresolvedGaps: number;
  unresolvedConflicts: number;
  specificityWarnings: number;
  poolAMarkerCount: number;
  poolBMarkerCount: number;
  untracedParagraphs: number;
}

// ── AI Provider Abstraction ───────────────────────────────────────────────────

export interface EmbeddingRequest {
  content: string | Buffer;
  contentType: "text" | "image";
  modelVersion?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  modelVersion: string;
  tokenCount?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: string;
  model: string;
}

// ── Worker Jobs ───────────────────────────────────────────────────────────────

export type JobType =
  | "document.ingest"
  | "document.embed"
  | "gap-analysis.run"
  | "conflict.detect"
  | "draft.section"
  | "export.generate";

export interface JobPayload {
  "document.ingest": { documentId: string };
  "document.embed": { passageIds: string[]; modelVersion: string };
  "gap-analysis.run": { methodStatementId: string };
  "conflict.detect": { methodStatementId: string };
  "draft.section": { methodStatementId: string; sectionKey: SectionKey };
  "export.generate": { methodStatementId: string; exportOptions: ExportOptions };
}
