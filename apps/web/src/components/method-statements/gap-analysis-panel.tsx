"use client";

import { useState } from "react";
import { GAP_STATUS_LABELS, GAP_STATUS_COLOR } from "@ams/shared";
import type { GapStatus } from "@ams/shared";
import { cn } from "@/lib/utils";

interface GapItem {
  id: string;
  category: string;
  question: string;
  status: string;
  answer: string | null;
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

export default function GapAnalysisPanel({ gapItems, methodStatementId }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<GapStatus | "ALL">("ALL");

  const counts = gapItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered =
    filter === "ALL" ? gapItems : gapItems.filter((g) => g.status === filter);

  const unresolvedCount = gapItems.filter(
    (g) => g.status === "TO_BE_CONFIRMED" || g.status === "MISSING"
  ).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Gap Analysis</h2>
          <span className="text-xs text-gray-500">
            {gapItems.length} items
          </span>
          {unresolvedCount > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {unresolvedCount} unresolved
            </span>
          )}
        </div>
        <svg
          className={cn(
            "w-4 h-4 text-gray-400 transition-transform",
            expanded && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Filter tabs */}
          <div className="flex gap-1 px-5 pt-3 pb-2 overflow-x-auto">
            <button
              onClick={() => setFilter("ALL")}
              className={cn(
                "shrink-0 text-xs px-3 py-1 rounded-full transition-colors",
                filter === "ALL"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All ({gapItems.length})
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
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {filtered.map((item) => (
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
                    {item.answer && (
                      <p className="text-sm text-gray-600 mt-1 bg-gray-50 rounded px-2 py-1">
                        {item.answer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-gray-400">
                No items in this filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
