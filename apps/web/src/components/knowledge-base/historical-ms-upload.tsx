"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  trades: { id: string; name: string }[];
}

const APPROVAL_STATUSES = [
  { value: "COMPLETE", label: "Approved" },
  { value: "PROCESSING", label: "Draft / Pending review" },
];

export default function HistoricalMSUploadForm({ trades }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tradeId, setTradeId] = useState("");
  const [title, setTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("COMPLETE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      if (!title) setTitle(dropped.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    }
  }, [title]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !tradeId || !title.trim()) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tradeId", tradeId);
    formData.append("title", title.trim());
    if (projectName.trim()) formData.append("projectName", projectName.trim());
    if (client.trim()) formData.append("client", client.trim());
    formData.append("approvalStatus", approvalStatus);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 90));
      });

      const result = await new Promise<any>((resolve, reject) => {
        xhr.open("POST", "/api/knowledge-base");
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(JSON.parse(xhr.responseText)?.error ?? "Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      setProgress(100);
      router.push("/knowledge-base");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* File drop zone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Document *
        </label>
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "relative rounded-xl border-2 border-dashed transition-colors p-6 text-center",
            dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300"
          )}
        >
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{file.name}</span>
              <span className="text-gray-400">({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Drag a PDF or DOCX here, or <span className="text-brand-600">browse</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Trade */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Trade *</label>
        <select
          required
          value={tradeId}
          onChange={(e) => setTradeId(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select trade…</option>
          {trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Contiguous Bored Pile Wall — Commercial Tower"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Optional metadata */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project name</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. One Canada Square"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="e.g. Canary Wharf Group"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Approval status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Approval status *</label>
        <select
          value={approvalStatus}
          onChange={(e) => setApprovalStatus(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {APPROVAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Only "Approved" documents are included in default retrieval (REQ-KB-003).
        </p>
      </div>

      {/* Progress */}
      {loading && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !file || !tradeId || !title.trim()}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Uploading…" : "Upload to Knowledge Base"}
        </button>
      </div>
    </form>
  );
}
