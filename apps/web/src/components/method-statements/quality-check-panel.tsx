"use client";

// =============================================================================
// Quality Check Panel (REQ-EVAL, Phase 9)
//
// Runs static safety gates + optional LLM hallucination check.
// Shows blockers (must fix) and warnings (should review) before export.
// =============================================================================

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SafetyBlocker {
  code: string;
  message: string;
}

interface SafetyWarning {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

interface HallucinationResult {
  supported: boolean;
  claim: string;
  passageId: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
}

interface QualityCheckResult {
  passed: boolean;
  blockers: SafetyBlocker[];
  warnings: SafetyWarning[];
  hallucinationResults: HallucinationResult[];
  summary: {
    unresolvedGaps: number;
    unresolvedConflicts: number;
    draftedSections: number;
    totalSections: number;
  };
}

interface Props {
  methodStatementId: string;
}

export default function QualityCheckPanel({ methodStatementId }: Props) {
  const [result, setResult] = useState<QualityCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [includeHallucination, setIncludeHallucination] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/method-statements/${methodStatementId}/quality-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hallucinationCheck: includeHallucination }),
        }
      );
      if (res.ok) {
        setResult(await res.json());
      } else {
        const data = await res.json();
        setError(data.error ?? "Quality check failed.");
      }
    } finally {
      setChecking(false);
    }
  }

  const SEVERITY_COLOR: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Quality Check</h2>
        {result && (
          <span
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium",
              result.passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            )}
          >
            {result.passed ? "Ready to export" : `${result.blockers.length} blocker${result.blockers.length !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeHallucination}
          onChange={(e) => setIncludeHallucination(e.target.checked)}
          className="rounded"
        />
        Include LLM hallucination check (slower, uses AI tokens)
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={runCheck}
        disabled={checking}
        className="w-full py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {checking ? "Checking…" : result ? "Re-check" : "Run quality check"}
      </button>

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Sections drafted", `${result.summary.draftedSections}/${result.summary.totalSections}`],
              ["Unresolved gaps", String(result.summary.unresolvedGaps)],
              ["Conflicts", String(result.summary.unresolvedConflicts)],
              ["Status", result.passed ? "✓ Ready" : "✗ Needs review"],
            ].map(([label, value]) => (
              <div key={label} className="text-xs text-center rounded-lg bg-gray-50 px-2 py-2">
                <p className="text-gray-400">{label}</p>
                <p className="font-semibold text-gray-700 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Blockers */}
          {result.blockers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-red-700">Blockers (must fix before export)</p>
              {result.blockers.map((b, i) => (
                <div key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
                  {b.message}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-600">Warnings (should review)</p>
              {result.warnings.map((w, i) => (
                <div key={i} className={cn("text-xs border rounded-lg px-3 py-2", SEVERITY_COLOR[w.severity] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
                  {w.message}
                </div>
              ))}
            </div>
          )}

          {/* Hallucination results */}
          {result.hallucinationResults.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-600">
                Hallucination check — {result.hallucinationResults.filter((r) => !r.supported).length} unsupported claim{result.hallucinationResults.filter((r) => !r.supported).length !== 1 ? "s" : ""}
              </p>
              {result.hallucinationResults.filter((r) => !r.supported).map((r, i) => (
                <div key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
                  <p className="font-medium">"{r.claim.slice(0, 100)}…"</p>
                  <p className="text-red-500 mt-0.5">{r.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
