"use client";

// =============================================================================
// Specificity Hints (REQ-SPEC, Phase 7)
//
// Shows generic phrase warnings inline. Each warning includes the
// specific question the engineer needs to answer and (if available)
// a preferred vocabulary alternative.
// =============================================================================

import { cn } from "@/lib/utils";

interface SpecificityIssue {
  phrase: string;
  position: number;
  question: string;
  category: string;
  preferredTerm?: string | null;
  vocabularyCategory?: string | null;
}

interface Props {
  score: number;
  issues: SpecificityIssue[];
  wordCount?: number;
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "border-red-200 bg-red-50",
  plant: "border-amber-200 bg-amber-50",
  qa: "border-blue-200 bg-blue-50",
  general: "border-gray-200 bg-gray-50",
};

export default function SpecificityHints({ score, issues, wordCount, className }: Props) {
  if (issues.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-green-600", className)}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Specificity score {score}/100 — no generic phrases detected
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "text-xs font-mono font-bold px-2 py-0.5 rounded",
            score >= 70 ? "bg-green-50 text-green-700" : score >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
          )}
        >
          {score}/100
        </div>
        <span className="text-xs text-gray-500">
          {issues.length} specificity issue{issues.length !== 1 ? "s" : ""}
          {wordCount ? ` in ${wordCount} words` : ""}
        </span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {issues.map((issue, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              CATEGORY_COLORS[issue.category] ?? CATEGORY_COLORS.general
            )}
          >
            <div className="flex items-start gap-2">
              <span className="font-mono font-semibold shrink-0 text-gray-500">
                "{issue.phrase}"
              </span>
              {issue.preferredTerm && (
                <span className="shrink-0 text-gray-400">
                  → prefer "{issue.preferredTerm}"
                </span>
              )}
            </div>
            <p className="mt-0.5 text-gray-600">{issue.question}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
