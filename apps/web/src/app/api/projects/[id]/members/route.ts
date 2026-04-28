// GET  /api/projects/[id]/members — list members with user details
// POST /api/projects/[id]/members — add member by email with role

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const member = await db.projectMember.findFirst({ where: { projectId, userId } });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const members = await db.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({ members });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  // Only ADMIN or MANAGER can add members
  const requester = await db.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  if (!requester || !["ADMIN", "MANAGER"].includes(requester.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.role) {
    return NextResponse.json({ error: "email and role are required." }, { status: 400 });
  }

  const valid = ["ADMIN", "MANAGER", "ENGINEER", "PLANNER", "SAFETY", "COORDINATOR", "VIEWER"];
  if (!valid.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { email: body.email.toLowerCase().trim() },
    select: { id: true, name: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "No user with that email address exists. They must create an account and sign in first." },
      { status: 404 }
    );
  }

  const existing = await db.projectMember.findFirst({
    where: { projectId, userId: targetUser.id },
  });
  if (existing) {
    return NextResponse.json({ error: "User is already a member of this project." }, { status: 409 });
  }

  const newMember = await db.projectMember.create({
    data: { projectId, userId: targetUser.id, role: body.role },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({ member: newMember }, { status: 201 });
}
