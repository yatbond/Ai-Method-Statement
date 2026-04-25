import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import NewProjectButton from "@/components/projects/new-project-button";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string;

  const projects = await db.project.findMany({
    where: {
      members: { some: { userId } },
      archivedAt: null,
    },
    include: {
      members: { select: { role: true, userId: true } },
      _count: { select: { methodStatements: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">
            {projects.length} active project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg
            className="mx-auto w-12 h-12 text-gray-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          <p className="text-gray-500 text-sm">No projects yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Create a project to start producing method statements.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-500 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-medium text-gray-900 text-base leading-snug">
                  {project.name}
                </h2>
              </div>
              {project.description && (
                <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">
                  {project.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                <span>{project._count.methodStatements} method statement{project._count.methodStatements !== 1 ? "s" : ""}</span>
                <span>{project.members.length} member{project.members.length !== 1 ? "s" : ""}</span>
                <span className="ml-auto">{formatDate(project.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
