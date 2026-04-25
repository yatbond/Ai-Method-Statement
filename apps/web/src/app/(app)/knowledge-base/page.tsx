import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import KnowledgeBaseFilters from "@/components/knowledge-base/kb-filters";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ tradeId?: string; q?: string; page?: string }>;
}) {
  await auth(); // session guard handled by layout

  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1");
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: any = {
    ...(sp.tradeId && { tradeId: sp.tradeId }),
    ...(sp.q && {
      OR: [
        { title: { contains: sp.q, mode: "insensitive" } },
        { projectName: { contains: sp.q, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total, trades] = await Promise.all([
    db.historicalMethodStatement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        trade: { select: { name: true } },
        tags: { select: { key: true, value: true } },
        _count: { select: { sourcePassages: true } },
      },
    }),
    db.historicalMethodStatement.count({ where }),
    db.trade.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const pageCount = Math.ceil(total / limit);

  const STATUS_COLOR: Record<string, string> = {
    COMPLETE: "bg-green-50 text-green-700",
    PROCESSING: "bg-blue-50 text-blue-700",
    QUEUED: "bg-gray-100 text-gray-600",
    SUPERSEDED: "bg-amber-50 text-amber-700",
    WITHDRAWN: "bg-red-50 text-red-700",
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Knowledge Base</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total.toLocaleString()} approved historical method statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/knowledge-base/vocabulary"
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Vocabulary
          </Link>
          <Link
            href="/knowledge-base/upload"
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            + Upload MS
          </Link>
        </div>
      </div>

      {/* Filters */}
      <KnowledgeBaseFilters trades={trades} />

      {/* Results */}
      <div className="space-y-2 mt-4">
        {items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-400 text-sm">
              {sp.q || sp.tradeId
                ? "No method statements match your filters."
                : "No historical method statements in the knowledge base yet."}
            </p>
            <Link
              href="/knowledge-base/upload"
              className="mt-3 inline-block text-sm text-brand-600 hover:underline"
            >
              Upload the first one →
            </Link>
          </div>
        ) : (
          items.map((ms) => {
            const tradeTags = ms.tags.filter((t) => t.key === "plant").map((t) => t.value);
            const risks = ms.tags.filter((t) => t.key === "safetyRiskType").map((t) => t.value);
            const hasEmbeddings = ms._count.sourcePassages > 0;

            return (
              <div
                key={ms.id}
                className="bg-white rounded-xl border border-gray-200 px-5 py-4"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {ms.title}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          STATUS_COLOR[ms.approvalStatus] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ms.approvalStatus}
                      </span>
                      {!hasEmbeddings && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">
                          Not embedded
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="font-medium text-brand-700">{ms.trade.name}</span>
                      {ms.projectName && <span>{ms.projectName}</span>}
                      {ms.client && <span>{ms.client}</span>}
                      <span>{ms._count.sourcePassages} passages</span>
                    </div>

                    {(tradeTags.length > 0 || risks.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {tradeTags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {risks.slice(0, 2).map((risk, i) => (
                          <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">
                            {risk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/knowledge-base/${ms.id}`}
                    className="shrink-0 text-xs text-brand-600 hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/knowledge-base?page=${page - 1}${sp.tradeId ? `&tradeId=${sp.tradeId}` : ""}${sp.q ? `&q=${sp.q}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/knowledge-base?page=${page + 1}${sp.tradeId ? `&tradeId=${sp.tradeId}` : ""}${sp.q ? `&q=${sp.q}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
