"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/tiff": "TIFF",
};

const DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Contract" },
  { value: "SPECIFICATION", label: "Specification" },
  { value: "DRAWING", label: "Drawing" },
  { value: "RISK_ASSESSMENT", label: "Risk Assessment" },
  { value: "PROGRAMME", label: "Programme" },
  { value: "SITE_CONSTRAINTS", label: "Site Constraints" },
  { value: "OTHER", label: "Other" },
];

interface UploadingFile {
  file: File;
  documentType: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface Props {
  projectId: string;
  onUploadComplete?: () => void;
}

export default function DocumentUploader({ projectId, onUploadComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<UploadingFile[]>([]);

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => ACCEPTED_TYPES[f.type]);
    if (valid.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...valid.map((f) => ({
        file: f,
        documentType: guessDocumentType(f.name),
        progress: 0,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      e.target.value = "";
    },
    [addFiles]
  );

  function updateFile(index: number, patch: Partial<UploadingFile>) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function uploadAll() {
    const pending = files.filter((f) => f.status === "pending");
    await Promise.all(
      pending.map(async (_, i) => {
        const globalIndex = files.findIndex(
          (f, idx) => f.status === "pending" && idx >= i
        );
        if (globalIndex === -1) return;
        await uploadFile(globalIndex);
      })
    );
    onUploadComplete?.();
  }

  async function uploadFile(index: number) {
    const item = files[index];
    updateFile(index, { status: "uploading", progress: 10 });

    try {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("documentType", item.documentType);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          updateFile(index, { progress: Math.round((e.loaded / e.total) * 90) });
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.open("POST", `/api/projects/${projectId}/documents`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.responseText));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      updateFile(index, { status: "done", progress: 100 });
    } catch (err: any) {
      updateFile(index, {
        status: "error",
        error: err.message ?? "Upload failed",
        progress: 0,
      });
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const hasPending = files.some((f) => f.status === "pending");

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors p-8 text-center",
          dragging
            ? "border-brand-400 bg-brand-50"
            : "border-gray-200 hover:border-gray-300 bg-white"
        )}
      >
        <input
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_TYPES).join(",")}
          onChange={onFileInput}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <svg
          className="mx-auto w-10 h-10 text-gray-300 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          Drag and drop files, or{" "}
          <span className="text-brand-600">browse</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PDF, DOCX, XLSX, PNG, JPG, TIFF — up to 200 MB each
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3"
            >
              {/* File type badge */}
              <span className="shrink-0 text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {ACCEPTED_TYPES[item.file.type] ?? "FILE"}
              </span>

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{item.file.name}</p>
                <p className="text-xs text-gray-400">
                  {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>

              {/* Document type selector */}
              {item.status === "pending" && (
                <select
                  value={item.documentType}
                  onChange={(e) =>
                    updateFile(index, { documentType: e.target.value })
                  }
                  className="text-xs rounded-md border border-gray-200 px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Status */}
              {item.status === "uploading" && (
                <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.status === "done" && (
                <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {item.status === "error" && (
                <span className="text-xs text-red-600 truncate max-w-32">{item.error}</span>
              )}

              {/* Remove */}
              {(item.status === "pending" || item.status === "error") && (
                <button
                  onClick={() => removeFile(index)}
                  className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {hasPending && (
            <div className="flex justify-end pt-1">
              <button
                onClick={uploadAll}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
              >
                Upload {files.filter((f) => f.status === "pending").length} file
                {files.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function guessDocumentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("contract") || lower.includes("nec") || lower.includes("jct")) return "CONTRACT";
  if (lower.includes("spec") || lower.includes("nbs")) return "SPECIFICATION";
  if (lower.includes("dwg") || lower.includes("drawing") || lower.includes("drg")) return "DRAWING";
  if (lower.includes("risk") || lower.includes("ra") || lower.includes("hazard")) return "RISK_ASSESSMENT";
  if (lower.includes("programme") || lower.includes("program") || lower.includes("gantt")) return "PROGRAMME";
  if (lower.includes("constraint") || lower.includes("site")) return "SITE_CONSTRAINTS";
  return "OTHER";
}
