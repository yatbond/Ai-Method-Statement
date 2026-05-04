import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ msId: string }>;
}) {
  const { msId } = await params;
  const ms = await db.historicalMethodStatement.findUnique({
    where: { id: msId },
    select: { title: true },
  });
  return { title: ms?.title ?? "Knowledge Base Entry" };
}

export default async function KBDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ msId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  // auth guard handled by Clerk middleware and layout
  const { msId } = await params;
  const sp = await searchParams;
  const passagePage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const passageLimit = 20;
  const passageSkip = (passagePage - 1) * passageLimit;

  const ms = await db.historicalMethodStatement.findUnique({
    where: { id: msId },
    include: {
      trade: { select: { name: true } },
      tags: { select: { key: true, value: true, aiGenerated: true } },
      _count: { select: { sourcePassages: true } },
    },
  });

  if (!ms) notFound();

  const passages = await db.sourcePassage.findMany({
    where: { historicalMSId: msId, contentType: { in: ["text", "table"] } },
    orderBy: { pageNumber: "asc" },
    skip: passageSkip,
    take: passageLimit,
    select: {
      id: true,
      pageNumber: true,
      sectionHeading: true,
      extractedText: true,
      contentType: true,
    },
  });
  const passageCount = ms._count.sourcePassages;
  const passagePageCount = Math.max(1, Math.ceil(passageCount / passageLimit));
  const firstShown = passageCount === 0 ? 0 : passageSkip + 1;
  const lastShown = passageSkip + passages.length;

  const STATUS_COLOR: Record<string, string> = {
    COMPLETE:    "bg-green-50 text-green-700",
    PROCESSING:  "bg-blue-50 text-blue-700",
    QUEUED:      "bg-gray-100 text-gray-600",
    SUPERSEDED:  "bg-amber-50 text-amber-700",
    WITHDRAWN:   "bg-red-50 text-red-700",
  };

  const plant = ms.tags.filter((t) => t.key === "plant");
  const risks = ms.tags.filter((t) => t.key === "safetyRiskType");
  const otherTags = ms.tags.filter((t) => t.key !== "plant" && t.key !== "safetyRiskType");

  return (
    <div className="max-w-4xl">
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/knowledge-base" className="hover:text-gray-600">Knowledge Base</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600 truncate">{ms.title}</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{ms.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span className="font-medium text-brand-700">{ms.trade.name}</span>
            {ms.projectName && <span>{ms.projectName}</span>}
            {ms.client && <span>{ms.client}</span>}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ms.approvalStatus] ?? "bg-gray-100 text-gray-600"}`}
            >
              {ms.approvalStatus}
            </span>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {ms._count.sourcePassages} passages
        </div>
      </div>

      {/* Tags */}
      {(plant.length > 0 || risks.length > 0 || otherTags.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI-Generated Tags</h2>
          <div className="space-y-2">
            {plant.length > 0 && (
              <div>
                <span className="text-xs text-gray-400 mr-2">Plant:</span>
                {plant.map((t, i) => (
                  <span key={i} className="mr-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {t.value}
                    {t.aiGenerated && <span className="ml-1 text-gray-400">AI</span>}
                  </span>
                ))}
              </div>
            )}
            {risks.length > 0 && (
              <div>
                <span className="text-xs text-gray-400 mr-2">Safety risks:</span>
                {risks.map((t, i) => (
                  <span key={i} className="mr-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">
                    {t.value}
                  </span>
                ))}
              </div>
            )}
            {otherTags.length > 0 && (
              <div>
                {otherTags.map((t, i) => (
                  <span key={i} className="mr-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {t.key}: {t.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Passages preview */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Content Passages</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Showing {firstShown}-{lastShown} of {passageCount} passages
          </p>
        </div>
        {passages.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No passages extracted yet. The document may still be processing.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {passages.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-xs text-gray-400 font-mono w-8 pt-0.5">
                    p.{p.pageNumber ?? "?"}
                  </span>
                  <div className="flex-1 min-w-0">
                    {p.sectionHeading && (
                      <p className="text-xs font-medium text-brand-700 mb-0.5">
                        {p.sectionHeading}
                      </p>
                    )}
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {p.extractedText}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${p.contentType === "table" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                    {p.contentType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {passagePageCount > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
            <span>
              Page {passagePage} of {passagePageCount}
            </span>
            <div className="flex gap-2">
              {passagePage > 1 && (
                <Link
                  href={`/knowledge-base/${ms.id}?page=${passagePage - 1}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                >
                  Previous
                </Link>
              )}
              {passagePage < passagePageCount && (
                <Link
                  href={`/knowledge-base/${ms.id}?page=${passagePage + 1}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
