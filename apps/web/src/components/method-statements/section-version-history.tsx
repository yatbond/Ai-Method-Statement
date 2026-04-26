"use client";

// =============================================================================
// Section Version History (audit trail + rollback)
//
// Lists all versions of a section newest-first. Each version shows author,
// timestamp, AI/manual indicator, and a preview. Engineers can restore any
// prior version, which creates a new version record (non-destructive).
// =============================================================================

import { useState, useEffect, useCallback } from "react";

interface Version {
  id: string;
  version: number;
  content: string;
  prompt: string | null;
  createdAt: string;
  user: { id: string; name: string | null };
}

interface Props {
  sectionId: string;
  onRestored: (content: string) => void;
}

const PREVIEW_LENGTH = 300;

export default function SectionVersionHistory({ sectionId, onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    if (open && versions.length === 0) fetchVersions();
  }, [open, versions.length, fetchVersions]);

  async function restore(versionId: string) {
    setRestoring(versionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/versions/${versionId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        onRestored(data.content);
        await fetchVersions(); // Refresh list to show new restore version
      }
    } finally {
      setRestoring(null);
    }
  }

  const isAIDraft = (v: Version) =>
    v.prompt?.startsWith("AI draft") || v.prompt?.includes("Restored from");

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {versions.length > 0
          ? `Version history (${versions.length})`
          : "Version history"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-gray-400">No version history yet.</p>
          ) : (
            versions.map((v, i) => {
              const isExpanded = expandedId === v.id;
              const isCurrent = i === 0;
              const isAI = isAIDraft(v);
              const timestamp = new Date(v.createdAt).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              });

              return (
                <div
                  key={v.id}
                  className={`rounded-xl border overflow-hidden ${
                    isCurrent ? "border-brand-200 bg-brand-50/40" : "border-gray-200 bg-white"
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
                      isCurrent ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      v{v.version}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">
                          {v.user.name ?? "Unknown"}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          isAI
                            ? "bg-purple-50 text-purple-600"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {v.prompt?.startsWith("Restored") ? "restore" : isAI ? "AI draft" : "manual edit"}
                        </span>
                        {isCurrent && (
                          <span className="text-xs text-brand-600 font-medium">current</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{timestamp}</p>
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-3 py-3 space-y-2">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                        {v.content.length > PREVIEW_LENGTH
                          ? v.content.slice(0, PREVIEW_LENGTH) + "…"
                          : v.content}
                      </pre>
                      {!isCurrent && (
                        <button
                          onClick={() => restore(v.id)}
                          disabled={restoring === v.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                        >
                          {restoring === v.id ? "Restoring…" : `Restore v${v.version}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
