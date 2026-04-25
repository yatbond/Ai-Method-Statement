// =============================================================================
// Specificity engine (REQ-SPEC)
//
// Detects generic phrasing and produces a 0–100 specificity score per section.
// REQ-SPEC-001: Must detect defined generic phrases.
// REQ-SPEC-003: Must produce a score on a 0–100 scale.
// =============================================================================

import { GENERIC_PHRASES } from "@ams/shared";
import type { SpecificityIssue, SpecificityResult } from "@ams/shared";

const SPECIFICITY_QUESTIONS: Record<string, string> = {
  "as required": "Required by which document, clause, or standard? Please specify the reference.",
  "where necessary": "In which specific circumstances? What triggers this requirement?",
  "suitable equipment": "Which specific equipment? Include make, model, or capacity specification.",
  "appropriate PPE": "Which PPE items specifically? List each item required for this activity.",
  "proper supervision": "Who specifically supervises? What is their required qualification or role?",
  "relevant standards shall be followed": "Which standards? List each standard by number and title.",
  "inspection shall be carried out": "Which inspection? Who carries it out, and at what frequency or milestone?",
  "adequate supervision": "Who provides supervision? What level of qualification is required?",
  "competent person": "What specific competency or qualification is required? Which role holds it?",
  "where applicable": "In which specific situations does this apply? State the trigger condition.",
  "as appropriate": "Appropriate to what? Specify the condition or criteria.",
  "in accordance with applicable": "Which specific standards or regulations apply?",
  "suitable access": "What specific access arrangement? Describe equipment, dimensions, or specification.",
  "safe access shall be provided": "What specific access method? Include equipment type and any exclusion zones.",
  "appropriate measures": "What measures specifically? List each control measure.",
  "sufficient": "Sufficient by which measure? State the quantity, capacity, or acceptance criterion.",
  "adequate": "Adequate by which measure? State the quantity, capacity, or acceptance criterion.",
};

export function analyseSpecificity(sectionContent: string): SpecificityResult {
  const issues: SpecificityIssue[] = [];
  const lowerContent = sectionContent.toLowerCase();

  for (const phrase of GENERIC_PHRASES) {
    const lowerPhrase = phrase.toLowerCase();
    let searchFrom = 0;

    while (true) {
      const index = lowerContent.indexOf(lowerPhrase, searchFrom);
      if (index === -1) break;

      // Check it's a word boundary match (not a substring of a longer word)
      const before = index > 0 ? lowerContent[index - 1] : " ";
      const after =
        index + lowerPhrase.length < lowerContent.length
          ? lowerContent[index + lowerPhrase.length]
          : " ";

      const isWordBoundary = /\W/.test(before) && /\W/.test(after);

      if (isWordBoundary) {
        issues.push({
          phrase: sectionContent.slice(index, index + phrase.length),
          position: index,
          question:
            SPECIFICITY_QUESTIONS[phrase] ??
            `"${phrase}" is too generic. Please provide a specific answer.`,
          category: categorisePhrase(phrase),
        });
      }

      searchFrom = index + 1;
    }
  }

  const score = calculateScore(sectionContent, issues);

  return { score, issues };
}

function categorisePhrase(phrase: string): string {
  if (phrase.includes("PPE") || phrase.includes("supervision") || phrase.includes("access")) {
    return "safety";
  }
  if (phrase.includes("equipment") || phrase.includes("plant")) {
    return "plant";
  }
  if (phrase.includes("inspection") || phrase.includes("standard")) {
    return "qa";
  }
  return "general";
}

function calculateScore(content: string, issues: SpecificityIssue[]): number {
  if (!content.trim()) return 0;

  // Word count of content
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;

  // Each issue deducts points proportional to severity
  const issueWords = issues.reduce((sum, issue) => {
    return sum + issue.phrase.split(/\s+/).length;
  }, 0);

  const genericRatio = issueWords / wordCount;

  // Base score minus penalty for generic ratio
  // 0 issues → 100; 10% generic → ~80; 20% generic → ~60
  const score = Math.max(0, Math.min(100, Math.round(100 - genericRatio * 200)));

  return score;
}
