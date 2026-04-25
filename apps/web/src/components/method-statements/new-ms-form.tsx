"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Trade {
  id: string;
  name: string;
  activities: { id: string; name: string }[];
}

interface Props {
  projectId: string;
  trades: Trade[];
  userId: string;
}

export default function NewMethodStatementForm({ projectId, trades, userId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tradeId, setTradeId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTrade = trades.find((t) => t.id === tradeId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/method-statements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tradeId, activityId: activityId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create method statement.");
        return;
      }
      const data = await res.json();
      router.push(`/projects/${projectId}/method-statements/${data.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Excavation to Basement Level — Zone A"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-400">
          Be specific about the work activity and location.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Trade *
        </label>
        <select
          required
          value={tradeId}
          onChange={(e) => { setTradeId(e.target.value); setActivityId(""); }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Select trade…</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {selectedTrade && selectedTrade.activities.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Activity
          </label>
          <select
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">Select activity…</option>
            {selectedTrade.activities.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim() || !tradeId}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating…" : "Create method statement"}
        </button>
      </div>
    </form>
  );
}
