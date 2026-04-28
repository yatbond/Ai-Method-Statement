import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import NewMethodStatementForm from "@/components/method-statements/new-ms-form";

export const metadata = { title: "New Method Statement" };

export default async function NewMethodStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const userId = user.id;

  const project = await db.project.findFirst({
    where: { id, members: { some: { userId } }, archivedAt: null },
    select: { id: true, name: true },
  });

  if (!project) notFound();

  const trades = await db.trade.findMany({
    orderBy: { name: "asc" },
    include: { activities: { orderBy: { name: "asc" } } },
  });

  return (
    <div className="max-w-2xl">
      <nav className="text-sm text-gray-400 mb-2">
        <a href="/projects" className="hover:text-gray-600">Projects</a>
        <span className="mx-2">/</span>
        <a href={`/projects/${id}`} className="hover:text-gray-600">{project.name}</a>
        <span className="mx-2">/</span>
        <span className="text-gray-600">New Method Statement</span>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        New Method Statement
      </h1>

      <NewMethodStatementForm projectId={id} trades={trades} userId={userId} />
    </div>
  );
}
