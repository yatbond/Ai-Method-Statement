import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@ams/database";
import { MAX_UPLOAD_SIZE_BYTES } from "@ams/shared";
import { createStorageProvider } from "@ams/storage";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tradeId = typeof body.tradeId === "string" ? body.tradeId : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = typeof body.contentType === "string" && body.contentType
    ? body.contentType
    : "application/pdf";
  const size = Number(body.size ?? 0);

  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are imported." }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "File size is required." }, { status: 400 });
  }
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 200 MB." }, { status: 400 });
  }

  const trade = await db.trade.findUnique({ where: { id: tradeId }, select: { id: true } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  const storage = createStorageProvider();
  if (!storage.presignedUploadUrl) {
    return NextResponse.json(
      { error: "Direct browser upload requires S3-compatible storage." },
      { status: 400 }
    );
  }

  const safeName = path.basename(filename).replace(/[^a-z0-9._-]/gi, "_");
  const nonce = crypto.randomBytes(8).toString("hex");
  const fileKey = `knowledge-base/${tradeId}/${Date.now()}-${nonce}-${safeName}`;
  const uploadUrl = await storage.presignedUploadUrl(fileKey, contentType, 900);

  return NextResponse.json({
    uploadUrl,
    fileKey,
    contentType,
    expiresInSeconds: 900,
  });
}
