"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  status: string;
  specificityScore: number | null;
  _count: { comments: number };
}

interface Props {
  sectionKey: string;
  sectionTitle: string;
  section: Section | null;
  methodStatementId: string;
}

export default function SectionEditor({
  sectionKey,
  sectionTitle,
  section,
  methodStatementId,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const scoreClass =
    section?.specificityScore !== null && section?.specificityScore !== undefined
      ? section.specificityScore >= 70
        ? "specificity-high"
        : section.specificityScore >= 40
        ? "specificity-medium"
        : "specificity-low"
      : "";

  return (
    <div id={sectionKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-900">{sectionTitle}</h3>
          {section && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                section.status === "APPROVED"
                  ? "bg-green-50 text-green-700"
                  : section.status === "IN_REVIEW"
                  ? "bg-purple-50 text-purple-700"
                  : section.status === "DRAFT"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-500"
              )}
            >
              {section.status.replace("_", " ")}
            </span>
          )}
          {section?._count.comments > 0 && (
            <span className="text-xs text-gray-400">
              {section._count.comments} comment{section._count.comments !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {section?.specificityScore !== null && section?.specificityScore !== undefined && (
            <span className={cn("text-xs font-mono font-medium", scoreClass)}>
              {section.specificityScore}/100
            </span>
          )}
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

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {!section ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">
                This section has not been drafted yet.
              </p>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Draft this section
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="prose prose-sm max-w-none text-gray-700 min-h-24 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <p className="text-gray-400 italic text-sm">
                  [Section content appears here. Rich text editor integration in Phase 6.]
                </p>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  Add comment
                </button>
                <button className="text-xs text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg border border-brand-200 hover:border-brand-300 transition-colors">
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
