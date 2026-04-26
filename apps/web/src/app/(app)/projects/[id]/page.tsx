import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import TeamManager from "@/components/projects/team-manager";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { name: true } });
  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as any)?.id as string;

  const project = await db.project.findFirst({
    where: { id, members: { some: { userId } }, archivedAt: null },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      methodStatements: {
        orderBy: { updatedAt: "desc" },
        include: { trade: { select: { name: true } } },
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
        take: 5,
        select: { id: true, filename: true, status: true, uploadedAt: true, documentType: true },
      },
    },
  });

  if (!project) notFound();

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    IN_REVIEW: "bg-blue-50 text-blue-700",
    APPROVED: "bg-green-50 text-green-700",
    SUPERSEDED: "bg-amber-50 text-amber-700",
    WITHDRAWN: "bg-red-50 text-red-700",
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <nav className="text-sm text-gray-400 mb-2">
          <Link href="/projects" className="hover:text-gray-600">Projects</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{project.name}</span>
        </nav>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${id}/documents`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Documents
            </Link>
            <Link
              href={`/projects/${id}/method-statements/new`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              + New Method Statement
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Method statements */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
            Method Statements ({project.methodStatements.length})
          </h2>
          {project.methodStatements.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              No method statements yet.{" "}
              <Link
                href={`/projects/${id}/method-statements/new`}
                className="text-brand-600 hover:underline"
              >
                Create one
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {project.methodStatements.map((ms) => (
                <Link
                  key={ms.id}
                  href={`/projects/${id}/method-statements/${ms.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-brand-400 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ms.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ms.trade.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        statusColors[ms.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ms.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(ms.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: documents + team */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                Recent Documents
              </h2>
              <Link href={`/projects/${id}/documents`} className="text-xs text-brand-600 hover:underline">
                Manage →
              </Link>
            </div>
            {project.documents.length === 0 ? (
              <Link
                href={`/projects/${id}/documents`}
                className="block text-xs text-brand-600 hover:underline"
              >
                Upload documents →
              </Link>
            ) : (
              <div className="space-y-1.5">
                {project.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 text-xs text-gray-600 bg-white rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="truncate flex-1">{doc.filename}</span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                        doc.status === "COMPLETE"
                          ? "bg-green-50 text-green-700"
                          : doc.status === "ERROR"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-900 uppercase tracking-wide mb-3">
              Team ({project.members.length})
            </h2>
            <TeamManager
              projectId={id}
              initialMembers={project.members.map((m) => ({
                id: m.id,
                role: m.role as any,
                createdAt: m.createdAt.toISOString(),
                user: { id: m.user.id, name: m.user.name, email: m.user.email, image: null },
              }))}
              currentUserId={userId}
              currentUserRole={(project.members.find((m) => m.userId === userId)?.role ?? "VIEWER") as any}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
