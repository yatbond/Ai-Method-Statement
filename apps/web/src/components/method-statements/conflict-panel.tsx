"use client";

// =============================================================================
// Conflict Panel (REQ-CON, Phase 4)
//
// Surfaces contradictions between project documents (Pool A, authority rank 1-5)
// and retrieved precedents (Pool B, rank 7). Users must resolve each conflict
// before it is considered closed. Never auto-resolved.
// =============================================================================

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ConflictRecord {
  id: string;
  conflictType: string;
  topic: string;
  currentRequirement: string;
  conflictingContent: string;
  currentSourceRef?: string | null;
  conflictingSourceRef?: string | null;
  recommendedAction?: string | null;
  resolution: string;
  resolutionNote?: string | null;
  historicalMethodStatement?: { title: string } | null;
}

interface Props {
  conflicts: ConflictRecord[];
  methodStatementId: string;
}

const RESOLUTION_LABELS: Record<string, string> = {
  ACCEPT_CURRENT:   "Use project doc",
  ACCEPT_PRECEDENT: "Use precedent",
  MANUAL_EDIT:      "Manual edit",
  EXCLUDED:         "Dismissed",
  UNRESOLVED:       "Unresolved",
};

const RESOLUTION_BADGE: Record<string, string> = {
  ACCEPT_CURRENT:   "bg-green-50 text-green-700",
  ACCEPT_PRECEDENT: "bg-amber-50 text-amber-700",
  MANUAL_EDIT:      "bg-blue-50 text-blue-700",
  EXCLUDED:         "bg-gray-100 text-gray-500",
  UNRESOLVED:       "bg-red-50 text-red-700",
};

export default function ConflictPanel({ conflicts: initial, methodStatementId }: Props) {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>(initial);
  const [expanded, setExpanded] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  const unresolved = conflicts.filter((c) => c.resolution === "UNRESOLVED");

  async function runDetection() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(
        `/api/method-statements/${methodStatementId}/conflict-detection`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        setRunError(data.error ?? "Conflict detection failed.");
        return;
      }
      let attempts = 0;
      while (attempts < 40) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(
          `/api/method-statements/${methodStatementId}/conflict-detection`
        );
        if (poll.ok) {
          const data = await poll.json();
          if (data.latestJob?.status === "COMPLETE") {
            setConflicts(data.conflicts);
            break;
          }
          if (data.latestJob?.status === "FAILED") {
            setRunError(data.latestJob.errorMessage ?? "Conflict detection failed.");
            break;
          }
        }
        attempts++;
      }
    } finally {
      setRunning(false);
    }
  }

  const resolve = useCallback(
    async (
      conflict: ConflictRecord,
      resolution: "ACCEPT_CURRENT" | "ACCEPT_PRECEDENT" | "MANUAL_EDIT" | "EXCLUDED"
    ) => {
      setResolving(conflict.id);
      try {
        const res = await fetch(
          `/api/method-statements/${methodStatementId}/conflicts/${conflict.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resolution,
              resolutionNote: noteInput[conflict.id] ?? undefined,
            }),
          }
        );
        if (res.ok) {
          const updated = await res.json();
          setConflicts((prev) =>
            prev.map((c) => (c.id === conflict.id ? { ...c, ...updated } : c))
          );
        }
      } finally {
        setResolving(null);
      }
    },
    [methodStatementId, noteInput]
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Conflict Detection</h2>
          <span className="text-xs text-gray-500">{conflicts.length} found</span>
          {unresolved.length > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {unresolved.length} unresolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); runDetection(); }}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {running ? "Detecting…" : conflicts.length === 0 ? "Run Detection" : "Re-run"}
          </button>
          <svg
            className={cn("w-4 h-4 text-gray-400 transition-transform", expanded && "rotate-180")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {runError && (
        <div className="px-5 py-2 bg-red-50 text-xs text-red-700">{runError}</div>
      )}

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
          {conflicts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              {running
                ? "Detecting conflicts…"
                : 'No conflicts found yet. Click "Run Detection" to compare project docs against precedents.'}
            </div>
          ) : (
            conflicts.map((conflict) => {
              const isUnresolved = conflict.resolution === "UNRESOLVED";
              const isSaving = resolving === conflict.id;

              return (
                <div key={conflict.id} className={cn("px-5 py-4", !isUnresolved && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 text-xs px-2 py-0.5 rounded-full font-medium",
                        RESOLUTION_BADGE[conflict.resolution] ?? "bg-gray-100 text-gray-600"
                      )}
                    >
                      {RESOLUTION_LABELS[conflict.resolution] ?? conflict.resolution}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{conflict.topic}</p>

                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-xs font-medium text-green-700 mb-1">
                            Project document {conflict.currentSourceRef ? `· ${conflict.currentSourceRef}` : ""}
                          </p>
                          <p className="text-xs text-gray-700">{conflict.currentRequirement}</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-2.5">
                          <p className="text-xs font-medium text-amber-700 mb-1">
                            Precedent {conflict.conflictingSourceRef ? `· ${conflict.conflictingSourceRef}` : ""}
                            {conflict.historicalMethodStatement && (
                              <span className="font-normal"> — {conflict.historicalMethodStatement.title}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-700">{conflict.conflictingContent}</p>
                        </div>
                      </div>

                      {conflict.recommendedAction && (
                        <p className="mt-2 text-xs text-gray-500 italic">
                          {conflict.recommendedAction}
                        </p>
                      )}

                      {isUnresolved && (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            value={noteInput[conflict.id] ?? ""}
                            onChange={(e) =>
                              setNoteInput((prev) => ({ ...prev, [conflict.id]: e.target.value }))
                            }
                            placeholder="Optional resolution note…"
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => resolve(conflict, "ACCEPT_CURRENT")}
                              disabled={isSaving}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              Use project doc
                            </button>
                            <button
                              onClick={() => resolve(conflict, "ACCEPT_PRECEDENT")}
                              disabled={isSaving}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            >
                              Use precedent
                            </button>
                            <button
                              onClick={() => resolve(conflict, "MANUAL_EDIT")}
                              disabled={isSaving}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                            >
                              Manual edit
                            </button>
                            <button
                              onClick={() => resolve(conflict, "EXCLUDED")}
                              disabled={isSaving}
                              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            >
                              Dismiss
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
      )}
    </div>
  );
}
