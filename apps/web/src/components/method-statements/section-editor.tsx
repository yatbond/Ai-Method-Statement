"use client";

// =============================================================================
// Section Editor (REQ-DRAFT-002, Phase 6)
//
// Displays a method statement section with its drafted content.
// Users can trigger AI drafting, manually edit content, and see
// specificity scores. All content is fully editable (REQ-P5).
// =============================================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import SpecificityHints from "./specificity-hints";
import CitationViewer from "./citation-viewer";

interface Section {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  status: string;
  content?: string | null;
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
  section: initialSection,
  methodStatementId,
}: Props) {
  const [section, setSection] = useState<Section | null>(initialSection);
  const [expanded, setExpanded] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [specificityResult, setSpecificityResult] = useState<{
    score: number;
    issues: any[];
    wordCount?: number;
  } | null>(null);
  const [checkingSpecificity, setCheckingSpecificity] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const scoreClass =
    section?.specificityScore !== null && section?.specificityScore !== undefined
      ? section.specificityScore >= 70
        ? "specificity-high"
        : section.specificityScore >= 40
        ? "specificity-medium"
        : "specificity-low"
      : "";

  async function triggerDraft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(
        `/api/method-statements/${methodStatementId}/sections/${sectionKey}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        setDraftError(data.error ?? "Drafting failed.");
        return;
      }
      // Poll for completion every 3s
      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(
          `/api/method-statements/${methodStatementId}/sections/${sectionKey}`
        );
        if (pollRes.ok) {
          const data = await pollRes.json();
          if (data?.status === "DRAFT" || data?.status === "IN_REVIEW") {
            setSection(data);
            setDrafting(false);
            if (pollRef.current) clearInterval(pollRef.current);
            if (data?.content) checkSpecificity(data.content);
          }
        }
      }, 3000);

      // Timeout after 3 minutes
      setTimeout(() => {
        if (drafting && pollRef.current) {
          clearInterval(pollRef.current);
          setDrafting(false);
          setDraftError("Drafting timed out — please try again.");
        }
      }, 180_000);
    } catch {
      setDrafting(false);
      setDraftError("Network error — please try again.");
    }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/method-statements/${methodStatementId}/sections/${sectionKey}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setSection((prev) => ({ ...prev!, content: updated.content, status: updated.status }));
        setEditing(false);
        // Auto-check specificity after save
        checkSpecificity(editContent);
      }
    } finally {
      setSaving(false);
    }
  }

  const checkSpecificity = useCallback(
    async (contentToCheck: string) => {
      setCheckingSpecificity(true);
      try {
        const res = await fetch(
          `/api/method-statements/${methodStatementId}/sections/${sectionKey}/specificity`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: contentToCheck }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          setSpecificityResult(data);
        }
      } finally {
        setCheckingSpecificity(false);
      }
    },
    [methodStatementId, sectionKey]
  );

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
                  : section.status === "DRAFT" || section.status === "DRAFTING"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-500"
              )}
            >
              {section.status.replace(/_/g, " ")}
            </span>
          )}
          {drafting && (
            <span className="text-xs text-blue-600 animate-pulse">Drafting…</span>
          )}
          {section?._count?.comments > 0 && (
            <span className="text-xs text-gray-400">
              {section._count.comments} comment{section._count.comments !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {section?.specificityScore !== null && section?.specificityScore !== undefined && (
            <span
              className={cn("text-xs font-mono font-medium", scoreClass)}
              title="Specificity score (0–100)"
            >
              {section.specificityScore}/100
            </span>
          )}
          <svg
            className={cn("w-4 h-4 text-gray-400 transition-transform", expanded && "rotate-180")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {draftError && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
              {draftError}
            </div>
          )}

          {!section || !section.content ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">
                {drafting
                  ? "Drafting this section using available sources…"
                  : "This section has not been drafted yet."}
              </p>
              {!drafting && (
                <button
                  onClick={triggerDraft}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Draft this section
                </button>
              )}
            </div>
          ) : editing ? (
            <div className="space-y-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={16}
                className="w-full font-mono text-sm px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <CitationViewer
                content={section.content}
                className="min-h-16 p-4 rounded-lg border border-gray-100 bg-gray-50"
              />

              {specificityResult && (
                <SpecificityHints
                  score={specificityResult.score}
                  issues={specificityResult.issues}
                  wordCount={specificityResult.wordCount}
                />
              )}

              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => checkSpecificity(section.content!)}
                  disabled={checkingSpecificity}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-50 transition-colors"
                >
                  {checkingSpecificity ? "Checking…" : "Check specificity"}
                </button>
                <button
                  onClick={() => {
                    setEditContent(section.content ?? "");
                    setEditing(true);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={triggerDraft}
                  disabled={drafting}
                  className="text-xs text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg border border-brand-200 hover:border-brand-300 disabled:opacity-50 transition-colors"
                >
                  {drafting ? "Drafting…" : "Regenerate"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
