import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export const metadata = { title: "Export Review — AMS Studio" };

function readinessFromSections(sections: Array<{ specificityScore: number | null }>) {
  const scores = sections
    .map((section) => section.specificityScore)
    .filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export default async function ExportReviewPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const methodStatements = await db.methodStatement.findMany({
    where: { project: { members: { some: { userId: user.id } }, archivedAt: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { id: true, name: true } },
      trade: { select: { name: true } },
      gapItems: { select: { status: true } },
      conflicts: { where: { resolution: "UNRESOLVED" }, select: { id: true } },
      sections: { select: { specificityScore: true } },
      referenceMarkers: { where: { deletedAt: null }, select: { pool: true } },
      exports: { orderBy: { exportedAt: "desc" }, take: 1, select: { exportedAt: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Export Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Final check of gaps, conflicts, specificity, traceability, and Word export settings.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Method Statement</span>
          <span>Gaps</span>
          <span>Conflicts</span>
          <span>Traceability</span>
          <span>Readiness</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-gray-100">
          {methodStatements.map((ms) => {
            const openGaps = ms.gapItems.filter(
              (gap) => gap.status === "MISSING" || gap.status === "TO_BE_CONFIRMED"
            ).length;
            const poolA = ms.referenceMarkers.filter((marker) => marker.pool === "A").length;
            const poolB = ms.referenceMarkers.filter((marker) => marker.pool === "B").length;
            const readiness = readinessFromSections(ms.sections);

            return (
              <div
                key={ms.id}
                className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] items-center gap-4 px-5 py-4 text-sm"
              >
                <div>
                  <p className="font-semibold text-gray-900">{ms.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {ms.project.name} · {ms.trade.name} · {ms.status.replace(/_/g, " ")}
                  </p>
                </div>
                <span className={openGaps > 0 ? "text-amber-700" : "text-green-700"}>
                  {openGaps}
                </span>
                <span className={ms.conflicts.length > 0 ? "text-red-700" : "text-green-700"}>
                  {ms.conflicts.length}
                </span>
                <span className="text-gray-600">
                  {poolB} project · {poolA} precedent
                </span>
                <span className="text-gray-700">{readiness === null ? "N/A" : `${readiness}%`}</span>
                <Link
                  href={`/projects/${ms.project.id}/method-statements/${ms.id}/export`}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Export Review
                </Link>
              </div>
            );
          })}
          {methodStatements.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No method statements are ready for export review yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
