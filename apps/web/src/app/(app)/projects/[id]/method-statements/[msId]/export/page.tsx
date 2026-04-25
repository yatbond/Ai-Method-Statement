"use client";

// =============================================================================
// Export page (REQ-EXPORT, Phase 8)
//
// Pre-export summary, export options, previous exports, download.
// REQ-SIGN-001: Output carries no AI label — presented as the engineer's doc.
// REQ-SIGN-003: Status is DRAFT until human sign-off.
// =============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface ExportRecord {
  id: string;
  exportedAt: string;
  unresolvedGapCount: number;
  unresolvedConflictCount: number;
  poolAMarkerCount: number;
  poolBMarkerCount: number;
  appendixAIncluded: boolean;
  appendixBIncluded: boolean;
}

export default function ExportPage() {
  const params = useParams<{ id: string; msId: string }>();
  const { id, msId } = params;

  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [latestJob, setLatestJob] = useState<any>(null);
  const [options, setOptions] = useState({
    appendixAIncluded: true,
    appendixBIncluded: true,
    includeUnresolvedItemsAppendix: false,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/method-statements/${msId}/export`)
      .then((r) => r.json())
      .then((data) => {
        setExports(data.exports ?? []);
        setLatestJob(data.latestJob);
      });
  }, [msId]);

  async function triggerExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/method-statements/${msId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Export failed.");
        return;
      }
      // Poll until complete
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const pollRes = await fetch(`/api/method-statements/${msId}/export`);
        if (pollRes.ok) {
          const data = await pollRes.json();
          setLatestJob(data.latestJob);
          if (data.latestJob?.status === "COMPLETE") {
            setExports(data.exports ?? []);
            setExporting(false);
            clearInterval(poll);
          } else if (data.latestJob?.status === "FAILED") {
            setError(data.latestJob.errorMessage ?? "Export failed.");
            setExporting(false);
            clearInterval(poll);
          }
        }
        if (attempts > 40) {
          setExporting(false);
          setError("Export timed out. Please try again.");
          clearInterval(poll);
        }
      }, 3000);
    } catch {
      setExporting(false);
      setError("Network error. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl">
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/projects" className="hover:text-gray-600">Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-600">{id}</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}/method-statements/${msId}`} className="hover:text-gray-600">
          Method Statement
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">Export</span>
      </nav>

      <h1 className="text-xl font-semibold text-gray-900 mb-1">Export to Word</h1>
      <p className="text-sm text-gray-500 mb-6">
        Generates a .docx file. Requires human sign-off before client submission.
      </p>

      {/* Notice */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 mb-6">
        <strong>REQ-SIGN-001:</strong> The exported document carries no AI-generated label or watermark.
        It is presented as the engineer's own work document.{" "}
        <strong>REQ-SIGN-003:</strong> Human sign-off is required before submission to the client.
      </div>

      {/* Export options */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Export Options</h2>

        {[
          { key: "appendixAIncluded", label: "Include Appendix A — Project Document References" },
          { key: "appendixBIncluded", label: "Include Appendix B — Historical Precedent References" },
          { key: "includeUnresolvedItemsAppendix", label: "Include Appendix C — Unresolved Items" },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(options as any)[key]}
              onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={triggerExport}
          disabled={exporting}
          className="w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? "Generating…" : "Generate .docx"}
        </button>
      </div>

      {/* Previous exports */}
      {exports.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Previous Exports</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {exports.map((ex) => (
              <div key={ex.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-700">
                    {new Date(ex.exportedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    {ex.unresolvedGapCount > 0 && (
                      <span className="text-amber-600">{ex.unresolvedGapCount} unresolved gaps</span>
                    )}
                    {ex.unresolvedConflictCount > 0 && (
                      <span className="text-red-600">{ex.unresolvedConflictCount} conflicts</span>
                    )}
                    <span>{ex.poolBMarkerCount} proj. refs · {ex.poolAMarkerCount} precedent refs</span>
                  </div>
                </div>
                <a
                  href={`/api/method-statements/${msId}/export/${ex.id}`}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                  download
                >
                  Download .docx
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
