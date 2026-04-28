// =============================================================================
// Vocabulary API (P11 — v1.1)
//
// GET  /api/vocabulary          — list all terms (optionally filtered by category/trade)
// POST /api/vocabulary          — create a new term
// =============================================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const tradeScope = searchParams.get("tradeScope") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const terms = await db.vocabularyTerm.findMany({
    where: {
      ...(category && { category }),
      ...(tradeScope && { tradeScope: { has: tradeScope } }),
      ...(q && {
        OR: [
          { preferredTerm: { contains: q, mode: "insensitive" } },
          { prohibitedTerms: { has: q } },
        ],
      }),
    },
    orderBy: [{ category: "asc" }, { preferredTerm: "asc" }],
  });

  return NextResponse.json({ terms });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.preferredTerm || !body?.category) {
    return NextResponse.json({ error: "preferredTerm and category are required." }, { status: 400 });
  }

  const term = await db.vocabularyTerm.create({
    data: {
      preferredTerm: body.preferredTerm.trim(),
      prohibitedTerms: (body.prohibitedTerms ?? []).map((t: string) => t.trim()).filter(Boolean),
      tradeScope: (body.tradeScope ?? []).map((t: string) => t.trim()).filter(Boolean),
      category: body.category,
    },
  });

  return NextResponse.json({ term }, { status: 201 });
}
