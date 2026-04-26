"use client";

// =============================================================================
// Method Statement Brief Panel (REQ-DRAFT-001)
//
// Shows the generated Method Statement Brief — the structured context document
// passed to the drafting engine for every section. Engineers can regenerate
// it when confirmed answers or retrieved precedents change.
// =============================================================================

import { useState, useEffect } from "react";

interface BriefContent {
  trade: string;
  activity?: string;
  title: string;
  projectDocuments: Array<{ id: string; title: string; type: string }>;
  retrievedPrecedents: Array<{ title: string; trade: string; score: number }>;
  confirmedAnswers: Array<{ category: string; question: string; answer: string }>;
  missingGapCategories: string[];
  unresolvedConflicts: string[];
}

interface Props {
  methodStatementId: string;
}

export default function BriefPanel({ methodStatementId }: Props) {
  const [brief, setBrief] = useState<BriefContent | null>(null);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/method-statements/${methodStatementId}/brief`)
      .then((r) => r.json())
      .then((data) => {
        setBrief(data.brief ?? null);
        setGenerated(data.generated ?? false);
      })
      .finally(() => setLoading(false));
  }, [methodStatementId]);

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/brief`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief);
        setGenerated(true);
        setOpen(true);
      }
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-900">Method Statement Brief</h2>
          {!loading && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                generated ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {generated ? "Generated" : "Not yet generated"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); regenerate(); }}
            disabled={regenerating}
            className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors"
          >
            {regenerating ? "Generating…" : generated ? "Regenerate" : "Generate brief"}
          </button>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {!brief ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">
                Generate the brief to create a structured context document for AI drafting.
                It summarises confirmed answers, selected precedents, and project documents.
              </p>
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {regenerating ? "Generating…" : "Generate brief"}
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overview</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-gray-400">Trade</p>
                    <p className="font-medium text-gray-800 mt-0.5">{brief.trade}</p>
                  </div>
                  {brief.activity && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-gray-400">Activity</p>
                      <p className="font-medium text-gray-800 mt-0.5">{brief.activity}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Confirmed answers */}
              {brief.confirmedAnswers.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Confirmed answers ({brief.confirmedAnswers.length})
                  </h3>
                  <div className="space-y-1.5">
                    {brief.confirmedAnswers.map((a, i) => (
                      <div key={i} className="text-xs rounded-lg bg-green-50 px-3 py-2">
                        <p className="text-gray-500">{a.category} — {a.question}</p>
                        <p className="font-medium text-gray-800 mt-0.5">{a.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing gaps */}
              {brief.missingGapCategories.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                    Missing information ({brief.missingGapCategories.length} categories)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.missingGapCategories.map((cat, i) => (
                      <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Project documents */}
              {brief.projectDocuments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Project documents ({brief.projectDocuments.length})
                  </h3>
                  <div className="space-y-1">
                    {brief.projectDocuments.map((d, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        <span className="text-gray-400">{d.type?.replace(/_/g, " ")} —</span>{" "}
                        {d.title}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Retrieved precedents */}
              {brief.retrievedPrecedents.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Retrieved precedents ({brief.retrievedPrecedents.length})
                  </h3>
                  <div className="space-y-1">
                    {brief.retrievedPrecedents.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{p.title}</span>
                        <span className="text-gray-400 font-mono">{(p.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unresolved conflicts */}
              {brief.unresolvedConflicts.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                    Unresolved conflicts ({brief.unresolvedConflicts.length})
                  </h3>
                  <div className="space-y-1">
                    {brief.unresolvedConflicts.map((c, i) => (
                      <p key={i} className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-1.5">{c}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
