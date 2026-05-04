// =============================================================================
// Reference Markers API (REQ-TRS, Phase 5)
//
// Reference markers link method statement content back to source evidence.
// Pool A = historical method statements (precedents)
// Pool B = current project documents (highest authority)
//
// Every generated paragraph, table, or confirmed answer should have at least
// one reference marker (enforced at draft-time, audited at export).
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import { audit } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const markers = await db.referenceMarker.findMany({
    where: { methodStatementId: msId, deletedAt: null },
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
          sectionHeading: true,
          historicalMethodStatement: { select: { id: true, title: true } },
        },
      },
    },
  });

  return NextResponse.json(markers);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const {
    sectionId,
    positionInSection,
    pool,
    sourceDocumentId,
    sourcePassageId,
    sourcePassageExcerpt,
    sourcePageOrSection,
  } = body as {
    sectionId?: string;
    positionInSection?: number;
    pool: "A" | "B";
    sourceDocumentId?: string;
    sourcePassageId?: string;
    sourcePassageExcerpt?: string;
    sourcePageOrSection?: string;
  };

  if (!pool || !["A", "B"].includes(pool)) {
    return NextResponse.json({ error: "pool must be A or B." }, { status: 400 });
  }

  // Assign next sequential index number for this method statement
  const lastMarker = await db.referenceMarker.findFirst({
    where: { methodStatementId: msId, deletedAt: null },
    orderBy: { indexNumber: "desc" },
    select: { indexNumber: true },
  });
  const indexNumber = (lastMarker?.indexNumber ?? 0) + 1;

  const marker = await db.referenceMarker.create({
    data: {
      methodStatementId: msId,
      sectionId: sectionId ?? null,
      positionInSection: positionInSection ?? null,
      pool,
      sourceDocumentId: sourceDocumentId ?? null,
      sourcePassageId: sourcePassageId ?? null,
      sourcePassageExcerpt: sourcePassageExcerpt?.slice(0, 1000) ?? null,
      sourcePageOrSection: sourcePageOrSection ?? null,
      indexNumber,
      createdBy: userId,
    },
    include: {
      sourceDocument: { select: { id: true, filename: true, documentType: true } },
      sourcePassage: {
        select: {
          id: true,
          extractedText: true,
          pageNumber: true,
          historicalMethodStatement: { select: { title: true } },
        },
      },
    },
  });

  await audit({
    userId,
    action: "reference_marker.created",
    resourceType: "ReferenceMarker",
    resourceId: marker.id,
    metadata: { msId, pool, indexNumber },
  });

  return NextResponse.json(marker, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ msId: string }> }
) {
  const { msId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const { markerId } = await req.json();

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.referenceMarker.update({
    where: { id: markerId, methodStatementId: msId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
