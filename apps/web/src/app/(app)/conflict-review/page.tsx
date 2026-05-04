import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import ConflictPanel from "@/components/method-statements/conflict-panel";

export const metadata = { title: "Conflict Review — AMS Studio" };

export default async function ConflictReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ msId?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const methodStatements = await db.methodStatement.findMany({
    where: {
      project: { members: { some: { userId: user.id } }, archivedAt: null },
      conflicts: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      project: { select: { id: true, name: true } },
      trade: { select: { name: true } },
      conflicts: {
        where: { resolution: "UNRESOLVED" },
        select: { id: true },
      },
    },
  });

  const selectedMsId = sp.msId ?? methodStatements[0]?.id;
  const selected = selectedMsId
    ? await db.methodStatement.findFirst({
        where: {
          id: selectedMsId,
          project: { members: { some: { userId: user.id } }, archivedAt: null },
        },
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
          trade: { select: { name: true } },
          conflicts: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              conflictType: true,
              topic: true,
              currentRequirement: true,
              conflictingContent: true,
              currentSourceRef: true,
              conflictingSourceRef: true,
              recommendedAction: true,
              resolution: true,
              resolutionNote: true,
              historicalMethodStatement: { select: { title: true } },
            },
          },
        },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Conflict Review</h1>
          <p className="mt-1 text-sm text-gray-500">
            Run source conflict review after editing and before export.
          </p>
        </div>
        {selected && (
          <Link
            href={`/draft-editor?mode=edit&projectId=${selected.project.id}&msId=${selected.id}`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Back to Draft Editor
          </Link>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-gray-200 bg-white p-4 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-semibold text-gray-900">Method Statements</h2>
          <div className="mt-3 space-y-2">
            {methodStatements.map((ms) => (
              <Link
                key={ms.id}
                href={`/conflict-review?msId=${ms.id}`}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  selectedMsId === ms.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="block truncate font-medium">{ms.title}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {ms.project.name} · {ms.trade.name} · {ms.conflicts.length} unresolved
                </span>
              </Link>
            ))}
            {methodStatements.length === 0 && (
              <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">
                No conflicts recorded yet.
              </p>
            )}
          </div>
        </aside>

        <main>
          {selected ? (
            <ConflictPanel conflicts={selected.conflicts as any} methodStatementId={selected.id} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
              Select a method statement with conflicts, or run conflict detection from Draft Editor.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
