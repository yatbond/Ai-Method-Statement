import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import GapAnalysisPanel from "@/components/method-statements/gap-analysis-panel";
import SectionEditor from "@/components/method-statements/section-editor";
import SimilarMSBrowser from "@/components/method-statements/similar-ms-browser";
import { STANDARD_SECTIONS } from "@ams/shared";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; msId: string }>;
}) {
  const { msId } = await params;
  const ms = await db.methodStatement.findUnique({
    where: { id: msId },
    select: { title: true },
  });
  return { title: ms?.title ?? "Method Statement" };
}

export default async function MethodStatementPage({
  params,
}: {
  params: Promise<{ id: string; msId: string }>;
}) {
  const { id, msId } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string;

  const [ms, retrievalResults] = await Promise.all([
    db.methodStatement.findFirst({
      where: {
        id: msId,
        project: { members: { some: { userId } } },
      },
      include: {
        trade: { select: { id: true, name: true } },
        activity: { select: { name: true } },
        sections: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            sectionKey: true,
            sectionTitle: true,
            status: true,
            specificityScore: true,
            _count: { select: { comments: true } },
          },
        },
        gapItems: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            category: true,
            question: true,
            status: true,
            answer: true,
            sourceDocumentRef: true,
            notApplicableReason: true,
          },
        },
        conflicts: {
          where: { resolution: "UNRESOLVED" },
          select: { id: true, topic: true, conflictType: true },
        },
        _count: {
          select: { exports: true },
        },
      },
    }),
    db.retrievalResult.findMany({
      where: { methodStatementId: msId },
      orderBy: { score: "desc" },
      include: {
        historicalMethodStatement: {
          select: {
            id: true,
            title: true,
            projectName: true,
            client: true,
            approvalStatus: true,
            tags: { select: { key: true, value: true } },
            trade: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  if (!ms) notFound();

  const unresolvedGaps = ms.gapItems.filter(
    (g) => g.status === "TO_BE_CONFIRMED" || g.status === "MISSING"
  ).length;

  const statusColors: Record<string, string> = {
    NOT_STARTED: "text-gray-400",
    DRAFTING: "text-blue-500",
    DRAFT: "text-amber-500",
    IN_REVIEW: "text-purple-500",
    APPROVED: "text-green-500",
  };

  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/projects" className="hover:text-gray-600">Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-600">{id}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">{ms.title}</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{ms.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ms.trade.name}{ms.activity ? ` — ${ms.activity.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unresolvedGaps > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full font-medium">
              {unresolvedGaps} unresolved gap{unresolvedGaps !== 1 ? "s" : ""}
            </span>
          )}
          {ms.conflicts.length > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full font-medium">
              {ms.conflicts.length} conflict{ms.conflicts.length !== 1 ? "s" : ""}
            </span>
          )}
          <Link
            href={`/projects/${id}/method-statements/${msId}/export`}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Sections
            </h2>
            <nav className="space-y-0.5">
              {STANDARD_SECTIONS.map((def) => {
                const section = ms.sections.find((s) => s.sectionKey === def.key);
                return (
                  <a
                    key={def.key}
                    href={`#${def.key}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        section
                          ? statusColors[section.status] ?? "text-gray-400"
                          : "text-gray-200"
                      }`}
                      style={{ background: "currentColor" }}
                    />
                    <span className="truncate text-xs">{def.title}</span>
                    {section?.specificityScore !== null &&
                      section?.specificityScore !== undefined && (
                        <span
                          className={`ml-auto text-xs font-mono ${
                            section.specificityScore >= 70
                              ? "specificity-high"
                              : section.specificityScore >= 40
                              ? "specificity-medium"
                              : "specificity-low"
                          }`}
                        >
                          {section.specificityScore}
                        </span>
                      )}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="lg:col-span-3 space-y-4">
          {/* Retrieved precedents (REQ-RAG-003, REQ-RAG-004) */}
          <SimilarMSBrowser
            methodStatementId={ms.id}
            tradeId={ms.trade.id}
            initialResults={retrievalResults as any}
          />

          {/* Gap analysis (REQ-GAP-001 to REQ-GAP-005) */}
          <GapAnalysisPanel gapItems={ms.gapItems as any} methodStatementId={ms.id} />

          {/* Sections */}
          {STANDARD_SECTIONS.map((def) => {
            const section = ms.sections.find((s) => s.sectionKey === def.key);
            return (
              <SectionEditor
                key={def.key}
                sectionKey={def.key}
                sectionTitle={def.title}
                section={section ?? null}
                methodStatementId={ms.id}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
