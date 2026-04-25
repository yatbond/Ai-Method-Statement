import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;
  const orgId = (session.user as any)?.organisationId as string;

  const body = await req.json();
  const { name, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const project = await db.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      organisationId: orgId,
      members: {
        create: { userId, role: "MANAGER" },
      },
    },
  });

  await audit({
    userId,
    projectId: project.id,
    action: AUDIT_ACTIONS.PROJECT_CREATED,
    resourceType: "Project",
    resourceId: project.id,
    metadata: { name: project.name },
  });

  return NextResponse.json(project, { status: 201 });
}
