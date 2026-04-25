// PATCH /api/vocabulary/[termId] — update a term
// DELETE /api/vocabulary/[termId] — delete a term

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { termId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const term = await db.vocabularyTerm.update({
    where: { id: termId },
    data: {
      ...(body.preferredTerm !== undefined && { preferredTerm: body.preferredTerm.trim() }),
      ...(body.prohibitedTerms !== undefined && {
        prohibitedTerms: body.prohibitedTerms.map((t: string) => t.trim()).filter(Boolean),
      }),
      ...(body.tradeScope !== undefined && {
        tradeScope: body.tradeScope.map((t: string) => t.trim()).filter(Boolean),
      }),
      ...(body.category !== undefined && { category: body.category }),
    },
  });

  return NextResponse.json({ term });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { termId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.vocabularyTerm.delete({ where: { id: termId } });
  return NextResponse.json({ ok: true });
}
