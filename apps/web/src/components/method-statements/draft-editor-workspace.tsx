"use client";

import Link from "next/link";
import GapAnalysisPanel from "./gap-analysis-panel";
import SimilarMSBrowser from "./similar-ms-browser";
import TraceabilityPanel from "./traceability-panel";
import SectionEditor from "./section-editor";
import BriefPanel from "./brief-panel";
import VisualAttachments from "./visual-attachments";
import NewMethodStatementForm from "./new-ms-form";
import { cn } from "@/lib/utils";

type Mode = "new" | "select" | "edit" | "gaps" | "visual";

interface ProjectSummary {
  id: string;
  name: string;
}

interface MethodStatementSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  project: ProjectSummary;
  trade: { id: string; name: string };
  activity?: { name: string } | null;
  gapCount: number;
  conflictCount: number;
  readiness: number | null;
}

interface TradeForForm {
  id: string;
  name: string;
  activities: { id: string; name: string }[];
}

interface Props {
  mode: Mode;
  projects: ProjectSummary[];
  methodStatements: MethodStatementSummary[];
  selectedProjectId?: string;
  selectedMs: any | null;
  retrievalResults: any[];
  referenceMarkers: any[];
  trades: TradeForForm[];
  currentUserId: string;
}

function editorHref(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  return `/draft-editor?${sp.toString()}`;
}

function ReadinessBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-gray-400">No score</span>;
  }
  const tone =
    value >= 80
      ? "bg-green-50 text-green-700"
      : value >= 60
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-700";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      {value}% readiness
    </span>
  );
}

export default function DraftEditorWorkspace({
  mode,
  projects,
  methodStatements,
  selectedProjectId,
  selectedMs,
  retrievalResults,
  referenceMarkers,
  trades,
  currentUserId,
}: Props) {
  const activeProjectId = selectedProjectId ?? selectedMs?.project?.id ?? projects[0]?.id;
  const activeMsId = selectedMs?.id;
  const modes: Array<[Mode, string]> = [
    ["new", "Draft New MS"],
    ["select", "Select Existing MS"],
    ["edit", "Edit Current MS"],
    ["gaps", "Gap & Suggestions"],
    ["visual", "Visual Gen"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Draft Editor</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, select, edit, resolve gaps, and generate editable visuals in one workspace.
          </p>
        </div>
        <Link
          href={editorHref({ mode: "new", projectId: activeProjectId })}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Draft New MS
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2">
        {modes.map(([key, label]) => (
          <Link
            key={key}
            href={editorHref({ mode: key, projectId: activeProjectId, msId: activeMsId })}
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              mode === key
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {mode === "new" && (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Project</h2>
            <div className="space-y-2">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={editorHref({ mode: "new", projectId: project.id })}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm",
                    activeProjectId === project.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  )}
                >
                  {project.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            {activeProjectId ? (
              <NewMethodStatementForm
                projectId={activeProjectId}
                trades={trades}
                userId={currentUserId}
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">
                Create a project first, then return here to draft a method statement.
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "select" && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Select Existing Method Statement</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {methodStatements.map((ms) => (
              <Link
                key={ms.id}
                href={editorHref({ mode: "edit", projectId: ms.project.id, msId: ms.id })}
                className="block px-5 py-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {ms.project.name}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {ms.trade.name}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        {ms.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">{ms.title}</h3>
                    <p className="mt-1 text-xs text-gray-400">
                      {ms.gapCount} open gaps · {ms.conflictCount} unresolved conflicts
                    </p>
                  </div>
                  <ReadinessBadge value={ms.readiness} />
                </div>
              </Link>
            ))}
            {methodStatements.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No method statements yet.
              </div>
            )}
          </div>
        </div>
      )}

      {mode !== "new" && mode !== "select" && !selectedMs && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Select an existing method statement before using this editor mode.
          <div className="mt-4">
            <Link
              href={editorHref({ mode: "select", projectId: activeProjectId })}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Select Existing MS
            </Link>
          </div>
        </div>
      )}

      {selectedMs && mode === "edit" && (
        <div className="grid gap-5 xl:grid-cols-[260px_1fr_280px]">
          <aside className="rounded-xl border border-gray-200 bg-white p-4 xl:sticky xl:top-6 xl:self-start">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Current MS Sections
            </h2>
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-900">{selectedMs.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedMs.project.name} · {selectedMs.trade.name}
              </p>
            </div>
            <nav className="mt-4 space-y-1">
              {selectedMs.sections.map((section: any) => (
                <a
                  key={section.sectionKey}
                  href={`#${section.sectionKey}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <span className="truncate">{section.sectionTitle}</span>
                  {section.specificityScore !== null && (
                    <span className="font-mono text-gray-400">{section.specificityScore}</span>
                  )}
                </a>
              ))}
            </nav>
          </aside>

          <main className="space-y-4">
            {selectedMs.sections.map((section: any) => (
              <SectionEditor
                key={section.sectionKey}
                sectionKey={section.sectionKey}
                sectionTitle={section.sectionTitle}
                section={section}
                methodStatementId={selectedMs.id}
                currentUserId={currentUserId}
              />
            ))}
          </main>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">MS Assistant</h2>
              <div className="mt-3 grid gap-2">
                <Link
                  href={editorHref({ mode: "gaps", projectId: activeProjectId, msId: activeMsId })}
                  className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Open gap suggestions
                </Link>
                <Link
                  href={editorHref({ mode: "visual", projectId: activeProjectId, msId: activeMsId })}
                  className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Generate visual from section
                </Link>
                <Link
                  href={`/conflict-review?msId=${selectedMs.id}`}
                  className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Run conflict review
                </Link>
              </div>
            </div>
            <SimilarMSBrowser
              methodStatementId={selectedMs.id}
              tradeId={selectedMs.trade.id}
              initialResults={retrievalResults}
            />
          </aside>
        </div>
      )}

      {selectedMs && mode === "gaps" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <GapAnalysisPanel gapItems={selectedMs.gapItems} methodStatementId={selectedMs.id} />
            <BriefPanel methodStatementId={selectedMs.id} />
          </div>
          <div className="space-y-5">
            <SimilarMSBrowser
              methodStatementId={selectedMs.id}
              tradeId={selectedMs.trade.id}
              initialResults={retrievalResults}
            />
            <TraceabilityPanel
              initialMarkers={referenceMarkers}
              methodStatementId={selectedMs.id}
            />
          </div>
        </div>
      )}

      {selectedMs && mode === "visual" && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Visual Gen</h2>
            <p className="mt-1 text-xs text-gray-500">
              Create editable tables, charts, diagrams, or reviewed schematic graphics from selected sections.
            </p>
            <div className="mt-4 grid gap-2">
              {["Table Gen", "Chart Gen", "Diagram Gen", "Graphics Gen"].map((label) => (
                <button
                  key={label}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 hover:bg-white"
                >
                  {label}
                  <span className="block text-xs text-gray-400">
                    {label === "Graphics Gen" ? "Schematic only, review required" : "Editable structured output"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {selectedMs.sections
              .filter((section: any) => section.id)
              .map((section: any) => (
                <div key={section.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{section.sectionTitle}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Attach or review editable visuals for this section.
                      </p>
                    </div>
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                      Auto-suggest on
                    </span>
                  </div>
                  <VisualAttachments sectionId={section.id} />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
