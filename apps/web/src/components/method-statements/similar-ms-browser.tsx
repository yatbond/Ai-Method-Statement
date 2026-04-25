"use client";

// =============================================================================
// Similar MS Browser (REQ-RAG-003, journey step 5)
//
// Shows retrieved historical method statement precedents with human-readable
// retrieval reasons. Users can exclude any result they judge irrelevant.
// REQ-RAG-004: No auto-merge — each precedent is a suggestion only.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface RetrievalResult {
  id: string;
  score: number;
  reason: string;
  excluded: boolean;
  historicalMethodStatement: {
    id: string;
    title: string;
    projectName: string | null;
    client: string | null;
    approvalStatus: string;
    tags: Array<{ key: string; value: string }>;
    trade: { name: string };
  };
}

interface Props {
  methodStatementId: string;
  tradeId: string;
  initialResults?: RetrievalResult[];
}

export default function SimilarMSBrowser({
  methodStatementId,
  tradeId,
  initialResults,
}: Props) {
  const [results, setResults] = useState<RetrievalResult[]>(initialResults ?? []);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [crossTrade, setCrossTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/retrieve`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, [methodStatementId]);

  useEffect(() => {
    if (!initialResults || initialResults.length === 0) {
      fetchResults();
    }
  }, [fetchResults, initialResults]);

  async function runRetrieval() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/method-statements/${methodStatementId}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crossTradeOptIn: crossTrade, limit: 10 }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Retrieval failed.");
        return;
      }
      // Re-fetch persisted results so IDs are DB RetrievalResult IDs,
      // which the PATCH exclude endpoint requires.
      await fetchResults();
    } finally {
      setRunning(false);
    }
  }

  async function toggleExclude(result: RetrievalResult) {
    const next = !result.excluded;
    setResults((prev) =>
      prev.map((r) => (r.id === result.id ? { ...r, excluded: next } : r))
    );
    await fetch(`/api/method-statements/${methodStatementId}/retrieve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId: result.id, excluded: next }),
    });
  }

  const included = results.filter((r) => !r.excluded);
  const excluded = results.filter((r) => r.excluded);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Retrieved Precedents
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {included.length} included · {excluded.length} excluded
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={crossTrade}
              onChange={(e) => setCrossTrade(e.target.checked)}
              className="rounded"
            />
            Cross-trade search
          </label>
          <button
            onClick={runRetrieval}
            disabled={running}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {running ? "Searching…" : results.length === 0 ? "Find precedents" : "Re-run"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-3 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          Loading results…
        </div>
      ) : results.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">No precedents retrieved yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Click "Find precedents" to search the knowledge base.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {results.map((result) => {
            const ms = result.historicalMethodStatement;
            const tags = ms.tags ?? [];
            const plant = tags.filter((t) => t.key === "plant").map((t) => t.value);
            const risks = tags.filter((t) => t.key === "safetyRiskType").map((t) => t.value);

            return (
              <div
                key={result.id}
                className={cn(
                  "px-5 py-4 transition-colors",
                  result.excluded && "opacity-40"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Score indicator */}
                  <div className="shrink-0 mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                      <span className="text-xs font-mono font-bold text-brand-700">
                        {Math.round(result.score * 100)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {ms.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span className="text-brand-600 font-medium">{ms.trade.name}</span>
                      {ms.projectName && <span>{ms.projectName}</span>}
                    </div>

                    {/* Retrieval reason (REQ-RAG-003) */}
                    <p className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 inline-block">
                      {result.reason}
                    </p>

                    {/* Tags */}
                    {(plant.length > 0 || risks.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {plant.slice(0, 2).map((p, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {p}
                          </span>
                        ))}
                        {risks.slice(0, 1).map((r, i) => (
                          <span key={i} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Exclude toggle */}
                  <button
                    onClick={() => toggleExclude(result)}
                    className={cn(
                      "shrink-0 text-xs px-2.5 py-1 rounded-lg border transition-colors",
                      result.excluded
                        ? "border-gray-200 text-gray-400 hover:text-gray-700"
                        : "border-red-200 text-red-600 hover:bg-red-50"
                    )}
                  >
                    {result.excluded ? "Restore" : "Exclude"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
