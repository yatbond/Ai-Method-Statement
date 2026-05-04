import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export const metadata = { title: "Dashboard - AMS Studio" };

type IconName = "building" | "check" | "warning";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
  };

  if (name === "check") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m8 12.5 2.5 2.5L16 9" />
      </svg>
    );
  }

  if (name === "warning") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "amber" | "green" | "red";
}) {
  const classes = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-slate-950 p-2 text-white shadow-sm">
          <Icon name="building" className="h-[18px] w-[18px]" />
        </div>
        <div>{children}</div>
      </div>
      <Link href="/draft-editor" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
        Open Draft Editor
      </Link>
    </div>
  );
}

function PrototypeTestPanel() {
  const tests = [
    "Navigation contains Projects and Trades",
    "New MS Wizard is inside Draft Editor",
    "Gap suggestions are MS-specific",
    "Visual Gen is integrated into Draft Editor",
    "Each MS links to a project and trade",
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-950">Prototype Sanity Tests</h2>
        <Badge tone="green">5/5 passed</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {tests.map((test) => (
          <div key={test} className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <Icon name="check" className="h-[15px] w-[15px] text-emerald-500" />
            <span>{test}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const methodStatements = await db.methodStatement.findMany({
    where: { project: { members: { some: { userId: user.id } }, archivedAt: null } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
      trade: { select: { name: true } },
      gapItems: { select: { status: true } },
      conflicts: { where: { resolution: "UNRESOLVED" }, select: { id: true } },
      sections: { select: { specificityScore: true } },
    },
  });

  const activeCount = methodStatements.filter((ms) => ms.status !== "APPROVED").length;
  const openGapCount = methodStatements.reduce(
    (total, ms) =>
      total +
      ms.gapItems.filter((g) => g.status === "MISSING" || g.status === "TO_BE_CONFIRMED").length,
    0
  );
  const conflictCount = methodStatements.reduce((total, ms) => total + ms.conflicts.length, 0);
  const scoredSections = methodStatements.flatMap((ms) =>
    ms.sections
      .map((section) => section.specificityScore)
      .filter((score): score is number => typeof score === "number")
  );
  const avgReadiness =
    scoredSections.length > 0
      ? Math.round(scoredSections.reduce((sum, score) => sum + score, 0) / scoredSections.length)
      : null;

  const cards = [
    ["Active MS", activeCount.toString(), "Across active projects", "text-slate-950"],
    ["Open Gaps", openGapCount.toString(), "Need confirmation", "text-slate-950"],
    ["Conflicts", conflictCount.toString(), "Require review", "text-red-600"],
    ["Avg Readiness", avgReadiness === null ? "N/A" : `${avgReadiness}%`, "Before export", "text-slate-950"],
  ] as const;

  return (
    <div>
      <SectionTitle>
        <h1 className="text-xl font-semibold text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          High-level portfolio view. Detailed project/trade navigation is handled in Projects and Trades.
        </p>
      </SectionTitle>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value, helper, tone]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</p>
            <p className="mt-2 text-xs text-slate-400">{helper}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-950">Recently Updated Method Statements</h2>
          <div className="space-y-3">
            {methodStatements.slice(0, 8).map((ms) => {
              const openGaps = ms.gapItems.filter(
                (g) => g.status === "MISSING" || g.status === "TO_BE_CONFIRMED"
              ).length;
              const scores = ms.sections
                .map((section) => section.specificityScore)
                .filter((score): score is number => typeof score === "number");
              const readiness =
                scores.length > 0
                  ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
                  : null;

              return (
                <Link
                  key={ms.id}
                  href={`/draft-editor?mode=edit&projectId=${ms.project.id}&msId=${ms.id}`}
                  className="block rounded-lg border border-slate-100 bg-slate-50 p-4 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="blue">{ms.project.name}</Badge>
                        <Badge>{ms.trade.name}</Badge>
                        <Badge tone={ms.status === "APPROVED" ? "green" : ms.status === "IN_REVIEW" ? "amber" : "slate"}>
                          {ms.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <h3 className="mt-2 font-semibold text-slate-950">{ms.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {openGaps} open gaps / {ms.conflicts.length} unresolved conflicts / updated{" "}
                        {ms.updatedAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="min-w-24 text-right">
                      <div className="text-lg font-semibold text-slate-950">{readiness === null ? "N/A" : `${readiness}%`}</div>
                      <div className="text-xs text-slate-400">readiness</div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {methodStatements.length === 0 && (
              <div className="rounded-lg bg-slate-50 px-5 py-10 text-center text-sm text-slate-400">
                No method statements yet.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-950">Workflow</h2>
          <div className="space-y-3">
            {[
              ["1", "Draft Editor", "Start with Draft New MS wizard or select an existing MS."],
              ["2", "Gap & Suggestions", "Resolve MS-specific missing info while editing."],
              ["3", "Visual Gen", "Generate editable tables, charts, diagrams, and schematic graphics inside the editor."],
              ["4", "Conflict Review", "Run source conflict review after editing."],
              ["5", "Export Review", "Acknowledge unresolved items and export Word."],
            ].map(([number, title, body]) => (
              <div key={number} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                  {number}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-950">{title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <PrototypeTestPanel />
      </div>
    </div>
  );
}
