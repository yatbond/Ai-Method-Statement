import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import DraftEditorWorkspace from "@/components/method-statements/draft-editor-workspace";

export const metadata = { title: "Draft Editor — AMS Studio" };

type Mode = "new" | "select" | "edit" | "gaps" | "visual";

function normaliseMode(value?: string): Mode {
  if (value === "new" || value === "select" || value === "gaps" || value === "visual") {
    return value;
  }
  return "edit";
}

function readinessFromSections(sections: Array<{ specificityScore: number | null }>) {
  const scores = sections
    .map((section) => section.specificityScore)
    .filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export default async function DraftEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; projectId?: string; msId?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const mode = normaliseMode(sp.mode);

  const [projects, trades, allMethodStatements] = await Promise.all([
    db.project.findMany({
      where: { members: { some: { userId: user.id } }, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    db.trade.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        activities: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    db.methodStatement.findMany({
      where: { project: { members: { some: { userId: user.id } }, archivedAt: null } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
        trade: { select: { id: true, name: true } },
        activity: { select: { name: true } },
        gapItems: { select: { status: true } },
        conflicts: { where: { resolution: "UNRESOLVED" }, select: { id: true } },
        sections: { select: { specificityScore: true } },
      },
    }),
  ]);

  const selectedProjectId = sp.projectId ?? projects[0]?.id;
  const selectedMsId = sp.msId ?? allMethodStatements[0]?.id;

  const [selectedMs, retrievalResults, referenceMarkers] = selectedMsId
    ? await Promise.all([
        db.methodStatement.findFirst({
          where: {
            id: selectedMsId,
            project: { members: { some: { userId: user.id } }, archivedAt: null },
          },
          include: {
            project: { select: { id: true, name: true } },
            trade: { select: { id: true, name: true } },
            activity: { select: { name: true } },
            sections: {
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                sectionKey: true,
                sectionTitle: true,
                status: true,
                content: true,
                draftingNotes: true,
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
          },
        }),
        db.retrievalResult.findMany({
          where: { methodStatementId: selectedMsId },
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
        db.referenceMarker.findMany({
          where: { methodStatementId: selectedMsId, deletedAt: null },
          orderBy: [{ pool: "asc" }, { indexNumber: "asc" }],
          include: {
            sourceDocument: {
              select: { id: true, filename: true, documentType: true, authorityRank: true },
            },
            sourcePassage: {
              select: {
                id: true,
                extractedText: true,
                pageNumber: true,
                historicalMethodStatement: { select: { title: true } },
              },
            },
          },
        }),
      ])
    : [null, [], []];

  const methodStatements = allMethodStatements.map((ms) => ({
    id: ms.id,
    title: ms.title,
    status: ms.status,
    updatedAt: ms.updatedAt.toISOString(),
    project: ms.project,
    trade: ms.trade,
    activity: ms.activity,
    gapCount: ms.gapItems.filter(
      (gap) => gap.status === "MISSING" || gap.status === "TO_BE_CONFIRMED"
    ).length,
    conflictCount: ms.conflicts.length,
    readiness: readinessFromSections(ms.sections),
  }));

  const mappedMarkers = referenceMarkers.map((marker: any) => ({
    ...marker,
    sourceDocument: marker.sourceDocument
      ? { ...marker.sourceDocument, title: marker.sourceDocument.filename }
      : marker.sourceDocument,
  }));

  return (
    <DraftEditorWorkspace
      mode={mode}
      projects={projects}
      methodStatements={methodStatements}
      selectedProjectId={selectedProjectId}
      selectedMs={selectedMs}
      retrievalResults={retrievalResults as any}
      referenceMarkers={mappedMarkers as any}
      trades={trades}
      currentUserId={user.id}
    />
  );
}
