// =============================================================================
// Trade Packs page (REQ-TP)
//
// Lists all trades with their active trade pack version, required fields,
// typical sequences, and gap question bank. Trade packs are seeded data —
// read-only in the UI. Updates go through the seed/migration process.
// =============================================================================

import { getAuthUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@ams/database";
import Link from "next/link";
import SequenceDiagram from "@/components/method-statements/sequence-diagram";

export const metadata = { title: "Trade Packs — AMS Studio" };

export default async function TradePacksPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const trades = await db.trade.findMany({
    orderBy: { name: "asc" },
    include: {
      activities: { orderBy: { name: "asc" }, select: { id: true, name: true, description: true } },
      tradePacks: {
        where: { isActive: true },
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: {
          id: true,
          version: true,
          publishedAt: true,
          requiredFields: true,
          typicalSequences: true,
          commonPlant: true,
          commonLabour: true,
          safetyHazards: true,
          qaQcChecks: true,
          gapQuestionBank: true,
        },
      },
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Trade Packs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Standard templates and question banks used during gap analysis and drafting.
          Trade packs are managed through the seed process.
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">No trade packs found. Run <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">pnpm db:seed</code> to load standard data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => {
            const pack = trade.tradePacks[0] ?? null;
            const requiredFields = (pack?.requiredFields as string[] | null) ?? [];
            const typicalSequences = (pack?.typicalSequences as string[] | null) ?? [];
            const safetyHazards = (pack?.safetyHazards as string[] | null) ?? [];
            const gapQuestions = (pack?.gapQuestionBank as Array<{ category: string; question: string }> | null) ?? [];

            return (
              <div key={trade.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Trade header */}
                <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{trade.name}</h2>
                    {trade.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{trade.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {pack ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          v{pack.version} active
                        </span>
                        {pack.publishedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Published {new Date(pack.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                        No active pack
                      </span>
                    )}
                  </div>
                </div>

                {/* Activities */}
                {trade.activities.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Activities</p>
                    <div className="flex flex-wrap gap-1.5">
                      {trade.activities.map((a) => (
                        <span key={a.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {pack && (
                  <div className="divide-y divide-gray-100">
                    {/* Typical sequence diagram */}
                    {typicalSequences.length > 0 && (
                      <div className="px-5 py-4">
                        <p className="text-xs font-medium text-gray-500 mb-3">Typical sequence</p>
                        <SequenceDiagram steps={typicalSequences} compact />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                      {/* Required fields */}
                      <div className="px-5 py-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Required fields ({requiredFields.length})</p>
                        {requiredFields.slice(0, 5).map((f: string, i: number) => (
                          <p key={i} className="text-xs text-gray-600 leading-5">• {f}</p>
                        ))}
                        {requiredFields.length > 5 && (
                          <p className="text-xs text-gray-400 mt-1">+{requiredFields.length - 5} more</p>
                        )}
                        {requiredFields.length === 0 && <p className="text-xs text-gray-400">None defined</p>}
                      </div>

                      {/* Safety hazards */}
                      <div className="px-5 py-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Safety hazards ({safetyHazards.length})</p>
                        {safetyHazards.slice(0, 5).map((h: string, i: number) => (
                          <p key={i} className="text-xs text-gray-600 leading-5">• {h}</p>
                        ))}
                        {safetyHazards.length > 5 && (
                          <p className="text-xs text-gray-400 mt-1">+{safetyHazards.length - 5} more</p>
                        )}
                        {safetyHazards.length === 0 && <p className="text-xs text-gray-400">None defined</p>}
                      </div>

                      {/* Gap questions */}
                      <div className="px-5 py-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Gap questions ({gapQuestions.length})</p>
                        {gapQuestions.slice(0, 5).map((q, i: number) => (
                          <p key={i} className="text-xs text-gray-600 leading-5 truncate">• {q.question}</p>
                        ))}
                        {gapQuestions.length > 5 && (
                          <p className="text-xs text-gray-400 mt-1">+{gapQuestions.length - 5} more</p>
                        )}
                        {gapQuestions.length === 0 && <p className="text-xs text-gray-400">None defined</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
