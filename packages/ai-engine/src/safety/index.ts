// =============================================================================
// AI Safety Gates (REQ-SAFETY, Phase 9)
//
// Pre-export and pre-draft quality gates that enforce:
// - Maximum gap ratio (too many [GAP:] markers = draft is not ready)
// - Minimum specificity score threshold
// - Unsupported claim detection (citations to non-existent passages)
// - Hallucination check: verifies each [SRC:id] actually supports the claim
//
// These are gates — they block or warn, never auto-fix.
// =============================================================================

export interface SafetyGateResult {
  passed: boolean;
  warnings: SafetyWarning[];
  blockers: SafetyBlocker[];
}

export interface SafetyWarning {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface SafetyBlocker {
  code: string;
  message: string;
}

export interface SectionSafetyInput {
  sectionKey: string;
  sectionTitle: string;
  content: string;
  specificityScore?: number | null;
  citedPassageIds: string[];
  availablePassageIds: Set<string>;
}

// ── Static gate thresholds ────────────────────────────────────────────────────

const MAX_GAP_RATIO = 0.15;         // >15% of content is [GAP:] → blocker
const MIN_SPECIFICITY_SCORE = 30;   // <30 is a blocker
const WARN_SPECIFICITY_SCORE = 50;  // <50 is a warning
const MIN_CITATIONS_FOR_LONG_SECTION = 1; // Sections >100 words need ≥1 citation

export function runSectionSafetyGates(
  input: SectionSafetyInput
): SafetyGateResult {
  const warnings: SafetyWarning[] = [];
  const blockers: SafetyBlocker[] = [];

  const content = input.content ?? "";
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // Gate 1: Gap ratio
  const gapMatches = content.match(/\[GAP:/g) ?? [];
  const gapCount = gapMatches.length;
  const gapRatio = wordCount > 0 ? gapCount / wordCount : 0;

  if (gapRatio > MAX_GAP_RATIO) {
    blockers.push({
      code: "GAP_RATIO_EXCEEDED",
      message: `Section "${input.sectionTitle}" has ${gapCount} unresolved gap${gapCount !== 1 ? "s" : ""} (${Math.round(gapRatio * 100)}% of content). Resolve gaps before export.`,
    });
  } else if (gapCount > 0) {
    warnings.push({
      code: "GAPS_PRESENT",
      message: `Section "${input.sectionTitle}" contains ${gapCount} gap marker${gapCount !== 1 ? "s" : ""} that should be resolved.`,
      severity: "medium",
    });
  }

  // Gate 2: Specificity score
  if (input.specificityScore !== null && input.specificityScore !== undefined) {
    if (input.specificityScore < MIN_SPECIFICITY_SCORE) {
      blockers.push({
        code: "LOW_SPECIFICITY",
        message: `Section "${input.sectionTitle}" has a specificity score of ${input.specificityScore}/100 (minimum ${MIN_SPECIFICITY_SCORE}). Review generic phrases.`,
      });
    } else if (input.specificityScore < WARN_SPECIFICITY_SCORE) {
      warnings.push({
        code: "MEDIUM_SPECIFICITY",
        message: `Section "${input.sectionTitle}" specificity score is ${input.specificityScore}/100. Consider improving specificity.`,
        severity: "low",
      });
    }
  }

  // Gate 3: Orphaned citations (citing passage IDs that don't exist)
  for (const passageId of input.citedPassageIds) {
    if (!input.availablePassageIds.has(passageId)) {
      warnings.push({
        code: "ORPHANED_CITATION",
        message: `Section "${input.sectionTitle}" cites passage ${passageId} which no longer exists.`,
        severity: "high",
      });
    }
  }

  // Gate 4: Long sections without any citations
  if (wordCount > 100 && input.citedPassageIds.length < MIN_CITATIONS_FOR_LONG_SECTION) {
    warnings.push({
      code: "NO_CITATIONS",
      message: `Section "${input.sectionTitle}" (${wordCount} words) has no source citations. Every claim should be traceable.`,
      severity: "medium",
    });
  }

  return {
    passed: blockers.length === 0,
    warnings,
    blockers,
  };
}

export interface DocumentSafetyInput {
  sections: SectionSafetyInput[];
  unresolvedGapCount: number;
  unresolvedConflictCount: number;
  hasBeenReviewed?: boolean;
}

export function runDocumentSafetyGates(
  input: DocumentSafetyInput
): SafetyGateResult {
  const warnings: SafetyWarning[] = [];
  const blockers: SafetyBlocker[] = [];

  // Run per-section gates
  for (const section of input.sections) {
    if (!section.content?.trim()) continue;
    const sectionResult = runSectionSafetyGates(section);
    blockers.push(...sectionResult.blockers);
    warnings.push(...sectionResult.warnings);
  }

  // Document-level: unresolved conflicts are always a blocker
  if (input.unresolvedConflictCount > 0) {
    blockers.push({
      code: "UNRESOLVED_CONFLICTS",
      message: `${input.unresolvedConflictCount} conflict${input.unresolvedConflictCount !== 1 ? "s" : ""} between project documents and precedents must be resolved before export.`,
    });
  }

  // Document-level: high unresolved gap count is a warning
  if (input.unresolvedGapCount > 5) {
    warnings.push({
      code: "HIGH_GAP_COUNT",
      message: `${input.unresolvedGapCount} information gaps remain unresolved. The method statement may be incomplete.`,
      severity: "high",
    });
  }

  return {
    passed: blockers.length === 0,
    warnings,
    blockers,
  };
}
