import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export const metadata = { title: "Trades — AMS Studio" };

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tradeId?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const trades = await db.trade.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { activities: { some: { name: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    include: {
      activities: { orderBy: { name: "asc" }, select: { name: true } },
      historicalMS: {
        where: { approvalStatus: "COMPLETE" },
        take: 3,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, projectName: true, client: true },
      },
      _count: { select: { historicalMS: true, activities: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Trades</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse trades and approved historical method statements before drafting.
          </p>
        </div>
        <Link
          href="/trade-packs"
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Manage Trade Packs
        </Link>
      </div>

      <form className="rounded-xl border border-gray-200 bg-white p-4">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search trade, activity, equipment, risk, method..."
          className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {trades.map((trade) => (
          <div key={trade.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">{trade.name}</h2>
                {trade.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{trade.description}</p>
                )}
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {trade._count.historicalMS} MS
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {trade.activities.slice(0, 5).map((activity) => (
                <span key={activity.name} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {activity.name}
                </span>
              ))}
              {trade._count.activities > 5 && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                  +{trade._count.activities - 5}
                </span>
              )}
            </div>

            <div className="mt-5 space-y-2">
              {trade.historicalMS.map((ms) => (
                <Link
                  key={ms.id}
                  href={`/knowledge-base/${ms.id}`}
                  className="block rounded-lg bg-gray-50 px-3 py-2 hover:bg-gray-100"
                >
                  <p className="truncate text-sm font-medium text-gray-900">{ms.title}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[ms.projectName, ms.client].filter(Boolean).join(" · ") || "Approved precedent"}
                  </p>
                </Link>
              ))}
              {trade.historicalMS.length === 0 && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  No approved precedents yet.
                </p>
              )}
            </div>

            <Link
              href={`/knowledge-base?tradeId=${trade.id}`}
              className="mt-4 block rounded-lg bg-gray-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-gray-800"
            >
              Search Relevant MS
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
