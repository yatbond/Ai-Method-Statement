"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  status: string;
  pageCount: number | null;
  ocrUsed: boolean;
  extractionErrors: any;
  uploadedAt: string;
  processedAt: string | null;
  authorityRank: number;
}

interface Props {
  projectId: string;
  initialDocuments: Document[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: string }> = {
  QUEUED: { label: "Queued", className: "bg-gray-100 text-gray-600", icon: "⏳" },
  PROCESSING: { label: "Processing", className: "bg-blue-50 text-blue-700 animate-pulse", icon: "⚙️" },
  COMPLETE: { label: "Processed", className: "bg-green-50 text-green-700", icon: "✓" },
  ERROR: { label: "Error", className: "bg-red-50 text-red-700", icon: "✗" },
  SUPERSEDED: { label: "Superseded", className: "bg-amber-50 text-amber-700", icon: "↩" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Contract",
  SPECIFICATION: "Specification",
  DRAWING: "Drawing",
  RISK_ASSESSMENT: "Risk Assessment",
  PROGRAMME: "Programme",
  SITE_CONSTRAINTS: "Site Constraints",
  HISTORICAL_MS: "Historical MS",
  OTHER: "Document",
};

const RANK_LABELS: Record<number, string> = {
  1: "Contract",
  2: "Specification",
  3: "Drawing",
  4: "Safety",
  5: "Programme",
  6: "User-confirmed",
  7: "Historical MS",
  8: "Standard clause",
  9: "AI knowledge",
};

export default function DocumentList({ projectId, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Poll for status updates while any document is processing
  const hasProcessing = documents.some(
    (d) => d.status === "QUEUED" || d.status === "PROCESSING"
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/documents`);
    if (res.ok) {
      const data = await res.json();
      setDocuments(data);
    }
  }, [projectId]);

  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [hasProcessing, refresh]);

  if (documents.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const config = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.QUEUED;
        const isExpanded = expandedId === doc.id;
        const hasErrors =
          doc.extractionErrors && Object.keys(doc.extractionErrors).length > 0;

        return (
          <div
            key={doc.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : doc.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              {/* Doc type */}
              <span className="shrink-0 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded w-28 text-center truncate">
                {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>

              {/* Filename + size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate font-medium">{doc.filename}</p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(doc.fileSize)}
                  {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                  {doc.ocrUsed ? " · OCR" : ""}
                </p>
              </div>

              {/* Authority rank */}
              <span className="shrink-0 text-xs text-gray-400 hidden md:block">
                Rank {doc.authorityRank} — {RANK_LABELS[doc.authorityRank] ?? ""}
              </span>

              {/* Status badge */}
              <span
                className={cn(
                  "shrink-0 text-xs px-2 py-0.5 rounded-full font-medium",
                  config.className
                )}
              >
                {config.icon} {config.label}
              </span>

              {/* Expand chevron */}
              <svg
                className={cn(
                  "w-4 h-4 text-gray-300 shrink-0 transition-transform",
                  isExpanded && "rotate-180"
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3 text-sm space-y-2 bg-gray-50">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                  <span className="text-gray-500">Uploaded</span>
                  <span className="text-gray-700">{formatDateTime(doc.uploadedAt)}</span>

                  {doc.processedAt && (
                    <>
                      <span className="text-gray-500">Processed</span>
                      <span className="text-gray-700">{formatDateTime(doc.processedAt)}</span>
                    </>
                  )}

                  <span className="text-gray-500">MIME type</span>
                  <span className="text-gray-700 font-mono">{doc.mimeType}</span>

                  <span className="text-gray-500">Source authority</span>
                  <span className="text-gray-700">Rank {doc.authorityRank} — {RANK_LABELS[doc.authorityRank]}</span>
                </div>

                {hasErrors && (
                  <div className="mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                    <p className="font-medium mb-1">Extraction issues:</p>
                    {Array.isArray(doc.extractionErrors) ? (
                      doc.extractionErrors.map((e: any, i: number) => (
                        <p key={i}>Page {e.page}: {e.message}</p>
                      ))
                    ) : (
                      <p>{JSON.stringify(doc.extractionErrors)}</p>
                    )}
                  </div>
                )}

                {doc.status === "COMPLETE" && (
                  <a
                    href={`/projects/${projectId}/documents/${doc.id}`}
                    className="inline-block text-xs text-brand-600 hover:underline"
                  >
                    Browse extracted passages →
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
