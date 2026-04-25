"use client";

// =============================================================================
// Traceability Panel (REQ-TRS, Phase 5)
//
// Shows all reference markers linked to this method statement, grouped by pool.
// Pool B = current project documents (authority ranks 1-5, highest authority)
// Pool A = historical method statement precedents (rank 7)
//
// Every paragraph and table in the final MS must cite at least one marker.
// Users can manually add references or remove spurious ones.
// =============================================================================

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ReferenceMarker {
  id: string;
  indexNumber: number;
  pool: "A" | "B";
  sectionId?: string | null;
  sourcePageOrSection?: string | null;
  sourcePassageExcerpt?: string | null;
  sourceDocument?: {
    id: string;
    title: string;
    documentType: string;
    authorityRank?: number | null;
  } | null;
  sourcePassage?: {
    id: string;
    extractedText: string;
    pageNumber?: number | null;
    historicalMethodStatement?: { title: string } | null;
  } | null;
}

interface Props {
  initialMarkers: ReferenceMarker[];
  methodStatementId: string;
}

const POOL_LABELS: Record<"A" | "B", string> = {
  B: "Project Documents",
  A: "Historical Precedents",
};

const POOL_COLORS: Record<"A" | "B", string> = {
  B: "bg-green-50 text-green-700 border-green-100",
  A: "bg-amber-50 text-amber-700 border-amber-100",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Contract",
  SPECIFICATION: "Specification",
  DRAWING: "Drawing",
  RISK_ASSESSMENT: "Risk Assessment",
  PROGRAMME: "Programme",
  OTHER: "Document",
};

export default function TraceabilityPanel({
  initialMarkers,
  methodStatementId,
}: Props) {
  const [markers, setMarkers] = useState<ReferenceMarker[]>(initialMarkers);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const poolB = markers.filter((m) => m.pool === "B");
  const poolA = markers.filter((m) => m.pool === "A");

  async function removeMarker(markerId: string) {
    setRemoving(markerId);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/references`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markerId }),
      });
      if (res.ok) {
        setMarkers((prev) => prev.filter((m) => m.id !== markerId));
      }
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Source Traceability</h2>
          <span className="text-xs text-gray-500">{markers.length} references</span>
          {poolB.length > 0 && (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              {poolB.length} from project docs
            </span>
          )}
          {poolA.length > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              {poolA.length} from precedents
            </span>
          )}
        </div>
        <svg
          className={cn("w-4 h-4 text-gray-400 transition-transform", expanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {markers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              <p>No source references yet.</p>
              <p className="text-xs mt-1">
                References are created automatically when sections are drafted.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
              {([["B", poolB], ["A", poolA]] as ["B" | "A", ReferenceMarker[]][]).map(
                ([pool, poolMarkers]) => {
                  if (poolMarkers.length === 0) return null;
                  return (
                    <div key={pool} className="px-5 py-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Pool {pool} — {POOL_LABELS[pool]}
                      </p>
                      <div className="space-y-2">
                        {poolMarkers.map((marker) => {
                          const docTitle =
                            marker.sourceDocument?.title ??
                            marker.sourcePassage?.historicalMethodStatement?.title ??
                            "Unknown source";
                          const docType =
                            marker.sourceDocument?.documentType
                              ? DOC_TYPE_LABELS[marker.sourceDocument.documentType] ?? "Document"
                              : "Precedent";
                          const pageRef =
                            marker.sourcePageOrSection ??
                            (marker.sourcePassage?.pageNumber
                              ? `p.${marker.sourcePassage.pageNumber}`
                              : null);
                          const excerpt =
                            marker.sourcePassageExcerpt ??
                            marker.sourcePassage?.extractedText.slice(0, 200);

                          return (
                            <div
                              key={marker.id}
                              className={cn(
                                "rounded-lg border p-3 text-xs",
                                POOL_COLORS[marker.pool]
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-gray-500">
                                      [{marker.indexNumber}]
                                    </span>
                                    <span className="font-medium truncate">{docTitle}</span>
                                    <span className="shrink-0 text-gray-400">· {docType}</span>
                                    {pageRef && (
                                      <span className="shrink-0 text-gray-400">{pageRef}</span>
                                    )}
                                    {marker.sourceDocument?.authorityRank && (
                                      <span className="shrink-0 bg-white/60 px-1 rounded text-gray-500">
                                        rank {marker.sourceDocument.authorityRank}
                                      </span>
                                    )}
                                  </div>
                                  {excerpt && (
                                    <p className="mt-1 text-gray-600 line-clamp-2">
                                      {excerpt}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeMarker(marker.id)}
                                  disabled={removing === marker.id}
                                  className="shrink-0 text-gray-300 hover:text-gray-500 disabled:opacity-50"
                                  title="Remove reference"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
