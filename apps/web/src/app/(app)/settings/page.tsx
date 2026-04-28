// =============================================================================
// Settings page (Phase 10)
//
// Shows environment configuration status and AI cost summary.
// Sensitive values (API keys) are never rendered — only presence/absence.
// =============================================================================

import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@ams/database";

export const metadata = { title: "Settings — AMS Studio" };

function maskKey(value: string | undefined): { present: boolean; masked: string } {
  if (!value) return { present: false, masked: "—" };
  return {
    present: true,
    masked: value.slice(0, 6) + "••••••••" + value.slice(-4),
  };
}

export default async function SettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // AI cost summary — last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const costRecords = await db.aICostRecord.groupBy({
    by: ["operation", "model"],
    where: { recordedAt: { gte: thirtyDaysAgo } },
    _sum: { estimatedCostGbp: true, inputTokens: true, outputTokens: true },
    _count: { id: true },
    orderBy: { _sum: { estimatedCostGbp: "desc" } },
  });

  const totalCostGbp = costRecords.reduce(
    (acc, r) => acc + (r._sum.estimatedCostGbp ?? 0),
    0
  );

  const configs: { label: string; key: string; required: boolean; purpose: string }[] = [
    { label: "ANTHROPIC_API_KEY", key: "ANTHROPIC_API_KEY", required: true, purpose: "LLM drafting & AI analysis" },
    { label: "GOOGLE_API_KEY", key: "GOOGLE_API_KEY", required: true, purpose: "Gemini embeddings & Document AI" },
    { label: "DATABASE_URL", key: "DATABASE_URL", required: true, purpose: "PostgreSQL connection" },
    { label: "REDIS_URL", key: "REDIS_URL", required: true, purpose: "BullMQ job queue" },
    { label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", required: true, purpose: "Clerk authentication (public)" },
    { label: "CLERK_SECRET_KEY", key: "CLERK_SECRET_KEY", required: true, purpose: "Clerk authentication (server)" },
    { label: "STORAGE_BUCKET", key: "STORAGE_BUCKET", required: false, purpose: "S3-compatible file storage" },
    { label: "STORAGE_ENDPOINT", key: "STORAGE_ENDPOINT", required: false, purpose: "Storage endpoint (MinIO/S3)" },
  ];

  

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Environment configuration and usage overview.</p>
      </div>

      {/* Account */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Account</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Name</span>
            <span className="text-sm text-gray-900">{user?.name ?? "—"}</span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm text-gray-900">{user?.email ?? "—"}</span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Authentication</span>
            <span className="text-sm text-gray-900">Clerk (email + password)</span>
          </div>
        </div>
      </section>

      {/* Environment */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Environment configuration</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {configs.map(({ label, key, required, purpose }) => {
              const { present } = maskKey(process.env[key]);
              return (
                <div key={key} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{purpose}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {required && !present && (
                      <span className="text-xs text-red-600 font-medium">Required</span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                        present
                          ? "bg-green-50 text-green-700"
                          : required
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          present ? "bg-green-500" : required ? "bg-red-500" : "bg-gray-400"
                        }`}
                      />
                      {present ? "Set" : "Not set"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI cost summary */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">AI cost — last 30 days</h2>
          <span className="text-sm font-semibold text-gray-900">£{totalCostGbp.toFixed(2)}</span>
        </div>
        {costRecords.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-6 text-center">
            <p className="text-sm text-gray-400">No AI usage recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Operation</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Model</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Calls</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Tokens in</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Tokens out</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Cost (£)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {costRecords.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-gray-700">{r.operation}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-500">{r.model}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{r._count.id}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {((r._sum.inputTokens ?? 0) / 1000).toFixed(1)}k
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {((r._sum.outputTokens ?? 0) / 1000).toFixed(1)}k
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      £{(r._sum.estimatedCostGbp ?? 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900">
                    £{totalCostGbp.toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Cost estimates based on mid-2025 pricing. Embedding via Google Gemini is free-tier (£0).
        </p>
      </section>

      {/* System info */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">System</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {[
            ["LLM provider", "Anthropic Claude (claude-sonnet-4-6)"],
            ["Embedding model", "Google Gemini Embedding 2 (text-embedding-004, 3072 dims)"],
            ["Vector store", "PostgreSQL + pgvector (HNSW, cosine)"],
            ["Retrieval strategy", "Reciprocal Rank Fusion (RRF k=60, cosine + FTS)"],
            ["Document AI", "Google Document AI"],
            ["Export format", "DOCX (docx v9, REQ-SIGN-001 compliant)"],
          ].map(([label, value]) => (
            <div key={label} className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm text-gray-700 text-right">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
