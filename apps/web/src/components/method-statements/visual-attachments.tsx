"use client";

// =============================================================================
// VisualAttachments
//
// Lists Mermaid diagram visuals attached to a section. Users can add new
// diagrams (pasted Mermaid source), edit existing ones, mark as reviewed
// (REQ-VIS-004: clears schematic-only label), and delete.
// =============================================================================

import { useState, useEffect } from "react";
import MermaidRenderer from "./mermaid-renderer";

interface Visual {
  id: string;
  visualType: string;
  title: string | null;
  mermaidSource: string | null;
  isSchematicOnly: boolean;
  reviewedByUser: boolean;
  insertionOrder: number;
  generatedAt: string;
}

interface Props {
  sectionId: string;
}

export default function VisualAttachments({ sectionId }: Props) {
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addSource, setAddSource] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSource, setEditSource] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/sections/${sectionId}/visuals`)
      .then((r) => r.json())
      .then((d) => setVisuals(d.visuals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sectionId]);

  async function addVisual() {
    if (!addSource.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/visuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mermaidSource: addSource, title: addTitle }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add diagram."); return; }
      setVisuals((prev) => [...prev, data.visual]);
      setAddSource("");
      setAddTitle("");
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/visuals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, mermaidSource: editSource }),
      });
      if (res.ok) {
        const data = await res.json();
        setVisuals((prev) => prev.map((v) => (v.id === id ? data.visual : v)));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed(id: string) {
    const res = await fetch(`/api/sections/${sectionId}/visuals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewedByUser: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setVisuals((prev) => prev.map((v) => (v.id === id ? data.visual : v)));
    }
  }

  async function deleteVisual(id: string) {
    if (!confirm("Delete this diagram?")) return;
    const res = await fetch(`/api/sections/${sectionId}/visuals/${id}`, { method: "DELETE" });
    if (res.ok) setVisuals((prev) => prev.filter((v) => v.id !== id));
  }

  if (loading) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Diagrams ({visuals.length})
        </p>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
          >
            + Add diagram
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-xl border border-brand-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">New Mermaid diagram</p>
          {addError && (
            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{addError}</p>
          )}
          <input
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <textarea
            value={addSource}
            onChange={(e) => setAddSource(e.target.value)}
            rows={8}
            placeholder={"graph LR\n  A[Start] --> B[Step 1]\n  B --> C[End]"}
            className="w-full font-mono text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          {addSource.trim() && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-400 mb-2">Preview</p>
              <MermaidRenderer source={addSource} id="preview-add" />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={addVisual}
              disabled={adding || !addSource.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError(null); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {visuals.map((v) => (
        <div key={v.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-700 truncate">
                {v.title ?? "Untitled diagram"}
              </span>
              {v.isSchematicOnly && (
                <span className="shrink-0 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                  Schematic only
                </span>
              )}
              {v.reviewedByUser && (
                <span className="shrink-0 text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">
                  Reviewed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!v.reviewedByUser && (
                <button
                  onClick={() => markReviewed(v.id)}
                  className="text-xs text-green-600 hover:text-green-700 hover:underline"
                >
                  Mark reviewed
                </button>
              )}
              <button
                onClick={() => {
                  setEditingId(v.id);
                  setEditTitle(v.title ?? "");
                  setEditSource(v.mermaidSource ?? "");
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Edit
              </button>
              <button
                onClick={() => deleteVisual(v.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="p-4">
            {editingId === v.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <textarea
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  rows={8}
                  className="w-full font-mono text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                />
                {editSource.trim() && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs text-gray-400 mb-2">Preview</p>
                    <MermaidRenderer source={editSource} id={`preview-${v.id}`} />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(v.id)}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              v.mermaidSource && <MermaidRenderer source={v.mermaidSource} id={v.id} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
