"use client";

// =============================================================================
// Gap Analysis Panel (REQ-GAP, Phase 3)
//
// Shows gap items with status. Users can confirm answers (CONFIRMED_BY_USER)
// or mark items not applicable. Gap analysis can be re-run on demand.
// REQ-P2: no answer enters the draft without explicit user confirmation.
// =============================================================================

import { useState, useCallback } from "react";
import { GAP_STATUS_LABELS } from "@ams/shared";
import type { GapStatus } from "@ams/shared";
import { cn } from "@/lib/utils";

interface GapItem {
  id: string;
  category: string;
  question: string;
  status: string;
  answer: string | null;
  sourceDocumentRef?: string | null;
  notApplicableReason?: string | null;
}

interface Props {
  gapItems: GapItem[];
  methodStatementId: string;
}

const STATUS_BADGE: Record<GapStatus, string> = {
  CONFIRMED_BY_DOCUMENT: "bg-green-50 text-green-700",
  CONFIRMED_BY_USER: "bg-green-50 text-green-700",
  SUGGESTED_FROM_PRECEDENT: "bg-amber-50 text-amber-700",
  CONFLICT: "bg-red-50 text-red-700",
  NOT_APPLICABLE: "bg-gray-100 text-gray-500",
  TO_BE_CONFIRMED: "bg-blue-50 text-blue-700",
  MISSING: "bg-red-50 text-red-700",
};

const ACTIONABLE: GapStatus[] = [
  "TO_BE_CONFIRMED",
  "MISSING",
  "SUGGESTED_FROM_PRECEDENT",
];

export default function GapAnalysisPanel({ gapItems: initial, methodStatementId }: Props) {
  const [items, setItems] = useState<GapItem[]>(initial);
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<GapStatus | "ALL">("ALL");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = filter === "ALL" ? items : items.filter((g) => g.status === filter);

  const unresolvedCount = items.filter(
    (g) => g.status === "TO_BE_CONFIRMED" || g.status === "MISSING"
  ).length;

  async function runAnalysis() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/gap-analysis`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setRunError(data.error ?? "Gap analysis failed.");
        return;
      }
      // Poll for completion — simple approach: poll GET every 3s for up to 2 min
      let attempts = 0;
      while (attempts < 40) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`/api/method-statements/${methodStatementId}/gap-analysis`);
        if (pollRes.ok) {
          const data = await pollRes.json();
          if (data.latestJob?.status === "COMPLETE") {
            setItems(data.gapItems);
            break;
          }
          if (data.latestJob?.status === "FAILED") {
            setRunError(data.latestJob.errorMessage ?? "Gap analysis failed.");
            break;
          }
        }
        attempts++;
      }
    } finally {
      setRunning(false);
    }
  }

  const confirmAnswer = useCallback(
    async (item: GapItem) => {
      if (!answerDraft.trim()) return;
      setSaving(item.id);
      try {
        const res = await fetch(
          `/api/method-statements/${methodStatementId}/gap-items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm", answer: answerDraft }),
          }
        );
        if (res.ok) {
          const updated = await res.json();
          setItems((prev) =>
            prev.map((g) => (g.id === item.id ? { ...g, ...updated } : g))
          );
          setActiveItemId(null);
          setAnswerDraft("");
        }
      } finally {
        setSaving(null);
      }
    },
    [answerDraft, methodStatementId]
  );

  const markNA = useCallback(
    async (item: GapItem) => {
      setSaving(item.id);
      try {
        const res = await fetch(
          `/api/method-statements/${methodStatementId}/gap-items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "not_applicable" }),
          }
        );
        if (res.ok) {
          const updated = await res.json();
          setItems((prev) =>
            prev.map((g) => (g.id === item.id ? { ...g, ...updated } : g))
          );
        }
      } finally {
        setSaving(null);
      }
    },
    [methodStatementId]
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Gap Analysis</h2>
          <span className="text-xs text-gray-500">{items.length} items</span>
          {unresolvedCount > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {unresolvedCount} unresolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              runAnalysis();
            }}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {running ? "Analysing…" : items.length === 0 ? "Run Gap Analysis" : "Re-run"}
          </button>
          <svg
            className={cn("w-4 h-4 text-gray-400 transition-transform", expanded && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {runError && (
        <div className="px-5 py-2 bg-red-50 text-xs text-red-700">{runError}</div>
      )}

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Filter tabs */}
          <div className="flex gap-1 px-5 pt-3 pb-2 overflow-x-auto">
            <button
              onClick={() => setFilter("ALL")}
              className={cn(
                "shrink-0 text-xs px-3 py-1 rounded-full transition-colors",
                filter === "ALL" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All ({items.length})
            </button>
            {(Object.keys(GAP_STATUS_LABELS) as GapStatus[]).map((status) => {
              const count = counts[status] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={cn(
                    "shrink-0 text-xs px-3 py-1 rounded-full transition-colors",
                    filter === status
                      ? "bg-gray-900 text-white"
                      : `${STATUS_BADGE[status]} hover:opacity-80`
                  )}
                >
                  {GAP_STATUS_LABELS[status]} ({count})
                </button>
              );
            })}
          </div>

          {/* Gap items */}
          <div className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                {items.length === 0
                  ? 'Click "Run Gap Analysis" to detect information gaps.'
                  : "No items in this filter."}
              </div>
            ) : (
              filtered.map((item) => {
                const isActionable = ACTIONABLE.includes(item.status as GapStatus);
                const isActive = activeItemId === item.id;
                const isSaving = saving === item.id;

                return (
                  <div key={item.id} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 text-xs px-2 py-0.5 rounded-full font-medium",
                          STATUS_BADGE[item.status as GapStatus] ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {GAP_STATUS_LABELS[item.status as GapStatus] ?? item.status}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {item.category.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-gray-800 mt-0.5">{item.question}</p>

                        {/* Suggested or confirmed answer */}
                        {item.answer && (
                          <p className="mt-1 text-sm text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                            {item.answer}
                            {item.sourceDocumentRef && (
                              <span className="ml-1.5 text-xs text-gray-400">
                                {item.sourceDocumentRef}
                              </span>
                            )}
                          </p>
                        )}

                        {/* Confirm / N/A actions */}
                        {isActionable && !isActive && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => {
                                setActiveItemId(item.id);
                                setAnswerDraft(item.answer ?? "");
                              }}
                              className="text-xs text-brand-600 hover:underline"
                            >
                              {item.answer ? "Edit & confirm" : "Add answer & confirm"}
                            </button>
                            <span className="text-gray-300">·</span>
                            <button
                              onClick={() => markNA(item)}
                              disabled={isSaving}
                              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            >
                              Not applicable
                            </button>
                          </div>
                        )}

                        {/* Inline answer editor */}
                        {isActionable && isActive && (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={answerDraft}
                              onChange={(e) => setAnswerDraft(e.target.value)}
                              rows={3}
                              placeholder="Enter the confirmed answer…"
                              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => confirmAnswer(item)}
                                disabled={isSaving || !answerDraft.trim()}
                                className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                              >
                                {isSaving ? "Saving…" : "Confirm answer"}
                              </button>
                              <button
                                onClick={() => {
                                  setActiveItemId(null);
                                  setAnswerDraft("");
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
