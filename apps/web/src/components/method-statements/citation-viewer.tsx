"use client";

// =============================================================================
// Inline Source Citation Viewer (P11 — v1.1)
//
// Renders section content with [SRC:id] markers as clickable chips.
// Clicking a chip fetches and displays the source passage in a popover.
// [GAP: description] markers are rendered as red warning spans.
// =============================================================================

import { useState, useCallback } from "react";

interface PassageDetail {
  id: string;
  content: string;
  contentType: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  source: {
    type: "project" | "historical";
    title: string;
    documentType?: string;
    authorityRank?: number;
    projectName?: string;
    trade?: string;
  };
}

interface Props {
  content: string;
  className?: string;
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "src"; passageId: string; index: number }
  | { kind: "gap"; description: string };

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\[SRC:([a-z0-9]+)\]|\[GAP:\s*([^\]]+)\]/gi;
  let lastIndex = 0;
  let srcIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: content.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      segments.push({ kind: "src", passageId: match[1], index: ++srcIndex });
    } else if (match[2]) {
      segments.push({ kind: "gap", description: match[2].trim() });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

export default function CitationViewer({ content, className }: Props) {
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [passageCache, setPassageCache] = useState<Record<string, PassageDetail>>({});
  const [loading, setLoading] = useState(false);

  const fetchPassage = useCallback(
    async (passageId: string) => {
      if (passageCache[passageId]) {
        setActivePassageId(passageId);
        return;
      }
      setLoading(true);
      setActivePassageId(passageId);
      try {
        const res = await fetch(`/api/passages/${passageId}`);
        if (res.ok) {
          const data = await res.json();
          setPassageCache((prev) => ({ ...prev, [passageId]: data }));
        }
      } finally {
        setLoading(false);
      }
    },
    [passageCache]
  );

  const segments = parseSegments(content);
  const activePassage = activePassageId ? passageCache[activePassageId] : null;

  return (
    <div className={className}>
      {/* Rendered content */}
      <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{seg.value}</span>;
          }
          if (seg.kind === "gap") {
            return (
              <mark
                key={i}
                className="bg-red-100 text-red-700 px-1 rounded text-xs font-medium not-italic"
                title={`Gap: ${seg.description}`}
              >
                [GAP: {seg.description}]
              </mark>
            );
          }
          // src
          const isActive = activePassageId === seg.passageId;
          return (
            <button
              key={i}
              onClick={() =>
                isActive ? setActivePassageId(null) : fetchPassage(seg.passageId)
              }
              className={`inline-flex items-center align-baseline mx-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                isActive
                  ? "bg-brand-100 text-brand-700 ring-1 ring-brand-300"
                  : "bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-600"
              }`}
              title={`Source passage ${seg.passageId}`}
            >
              [{seg.index}]
            </button>
          );
        })}
      </div>

      {/* Passage popover */}
      {activePassageId && (
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
          {loading && !activePassage ? (
            <p className="text-xs text-gray-500">Loading source…</p>
          ) : activePassage ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-brand-800">{activePassage.source.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    {activePassage.source.type === "project" ? (
                      <>
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          Rank {activePassage.source.authorityRank}
                        </span>
                        <span>{activePassage.source.documentType?.replace("_", " ")}</span>
                        {activePassage.pageNumber && <span>p.{activePassage.pageNumber}</span>}
                      </>
                    ) : (
                      <>
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          Historical
                        </span>
                        <span>{activePassage.source.trade}</span>
                        {activePassage.pageNumber && <span>p.{activePassage.pageNumber}</span>}
                      </>
                    )}
                    {activePassage.sectionHeading && (
                      <span className="italic">{activePassage.sectionHeading}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setActivePassageId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed border-l-2 border-brand-300 pl-3">
                {activePassage.content}
              </p>
            </div>
          ) : (
            <p className="text-xs text-red-600">Source passage not available.</p>
          )}
        </div>
      )}
    </div>
  );
}
