"use client";

// =============================================================================
// Vocabulary Manager (P11 — v1.1)
//
// CRUD UI for VocabularyTerm records used by the specificity engine.
// Preferred terms replace the listed prohibited alternatives during drafting.
// =============================================================================

import { useState } from "react";
import { cn } from "@/lib/utils";

interface VocabularyTerm {
  id: string;
  preferredTerm: string;
  prohibitedTerms: string[];
  tradeScope: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ["plant", "safety", "role", "section", "permit", "qa", "general"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLOR: Record<string, string> = {
  plant:   "bg-blue-50 text-blue-700",
  safety:  "bg-red-50 text-red-700",
  role:    "bg-purple-50 text-purple-700",
  section: "bg-gray-100 text-gray-700",
  permit:  "bg-amber-50 text-amber-700",
  qa:      "bg-green-50 text-green-700",
  general: "bg-gray-50 text-gray-600",
};

interface Props {
  initialTerms: VocabularyTerm[];
  trades: { id: string; name: string }[];
}

export default function VocabularyManager({ initialTerms, trades }: Props) {
  const [terms, setTerms] = useState<VocabularyTerm[]>(initialTerms);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterQ, setFilterQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newPreferred, setNewPreferred] = useState("");
  const [newProhibited, setNewProhibited] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("general");
  const [newTradeScope, setNewTradeScope] = useState<string[]>([]);

  // Edit state
  const [editPreferred, setEditPreferred] = useState("");
  const [editProhibited, setEditProhibited] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("general");
  const [editTradeScope, setEditTradeScope] = useState<string[]>([]);

  const filtered = terms.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterQ && !t.preferredTerm.toLowerCase().includes(filterQ.toLowerCase()) &&
        !t.prohibitedTerms.some((p) => p.toLowerCase().includes(filterQ.toLowerCase()))) return false;
    return true;
  });

  function startEdit(term: VocabularyTerm) {
    setEditing(term.id);
    setEditPreferred(term.preferredTerm);
    setEditProhibited(term.prohibitedTerms.join(", "));
    setEditCategory(term.category as Category);
    setEditTradeScope(term.tradeScope);
  }

  async function saveEdit(termId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/vocabulary/${termId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredTerm: editPreferred,
          prohibitedTerms: editProhibited.split(",").map((s) => s.trim()).filter(Boolean),
          category: editCategory,
          tradeScope: editTradeScope,
        }),
      });
      if (!res.ok) { setError("Failed to save."); return; }
      const { term } = await res.json();
      setTerms((prev) => prev.map((t) => (t.id === termId ? term : t)));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerm(termId: string) {
    if (!confirm("Delete this vocabulary term?")) return;
    await fetch(`/api/vocabulary/${termId}`, { method: "DELETE" });
    setTerms((prev) => prev.filter((t) => t.id !== termId));
  }

  async function addTerm() {
    if (!newPreferred.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredTerm: newPreferred.trim(),
          prohibitedTerms: newProhibited.split(",").map((s) => s.trim()).filter(Boolean),
          category: newCategory,
          tradeScope: newTradeScope,
        }),
      });
      if (!res.ok) { setError("Failed to add term."); return; }
      const { term } = await res.json();
      setTerms((prev) => [...prev, term]);
      setNewPreferred("");
      setNewProhibited("");
      setNewCategory("general");
      setNewTradeScope([]);
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  function toggleTradeScope(tradeId: string, setter: (fn: (prev: string[]) => string[]) => void) {
    setter((prev) =>
      prev.includes(tradeId) ? prev.filter((id) => id !== tradeId) : [...prev, tradeId]
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search terms…"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          className="flex-1 min-w-48 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          + Add term
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-brand-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Add vocabulary term</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Preferred term *</label>
              <input
                type="text"
                value={newPreferred}
                onChange={(e) => setNewPreferred(e.target.value)}
                placeholder="e.g. excavator"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prohibited alternatives (comma-separated)</label>
              <input
                type="text"
                value={newProhibited}
                onChange={(e) => setNewProhibited(e.target.value)}
                placeholder="e.g. digger, JCB, machine"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category *</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Category)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-2">Trade scope (blank = all trades)</label>
              <div className="flex flex-wrap gap-1.5">
                {trades.map((t) => (
                  <label key={t.id} className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTradeScope.includes(t.id)}
                      onChange={() => toggleTradeScope(t.id, setNewTradeScope)}
                      className="rounded"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={addTerm}
              disabled={saving || !newPreferred.trim()}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Add term"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Terms list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">{filtered.length} term{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">
              {terms.length === 0 ? "No vocabulary terms yet. Add the first one above." : "No terms match your filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((term) => (
              <div key={term.id} className="px-5 py-3">
                {editing === term.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editPreferred}
                        onChange={(e) => setEditPreferred(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Preferred term"
                      />
                      <input
                        type="text"
                        value={editProhibited}
                        onChange={(e) => setEditProhibited(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Prohibited alternatives (comma-separated)"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as Category)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {trades.map((t) => (
                          <label key={t.id} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editTradeScope.includes(t.id)}
                              onChange={() => toggleTradeScope(t.id, setEditTradeScope)}
                              className="rounded"
                            />
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(term.id)}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        className={cn("text-xs px-2 py-0.5 rounded-full font-medium", CATEGORY_COLOR[term.category] ?? "bg-gray-100 text-gray-600")}
                      >
                        {term.category}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{term.preferredTerm}</span>
                      {term.prohibitedTerms.length > 0 && (
                        <span className="text-xs text-gray-400">
                          replaces: {term.prohibitedTerms.join(", ")}
                        </span>
                      )}
                      {term.tradeScope.length > 0 && (
                        <span className="text-xs text-gray-400">
                          [{trades.filter((t) => term.tradeScope.includes(t.id)).map((t) => t.name).join(", ")}]
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(term)}
                        className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTerm(term.id)}
                        className="text-xs px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
