import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createStorageProvider } from "@ams/storage";
import { getAuthUser } from "@/lib/auth";

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storage = createStorageProvider();
  const content = `ams-storage-test:${crypto.randomUUID()}`;
  const key = `healthcheck/${Date.now()}-${crypto.randomUUID()}.txt`;

  try {
    await storage.upload(key, Buffer.from(content, "utf8"), "text/plain");
    const downloaded = await storage.download(key);
    const downloadedContent = downloaded.toString("utf8");
    if (downloadedContent !== content) {
      throw new Error("Storage test upload succeeded, but downloaded content did not match.");
    }
    await storage.delete(key);

    return NextResponse.json({
      ok: true,
      provider: process.env.STORAGE_PROVIDER ?? "local",
      bucket: process.env.AWS_S3_BUCKET ?? process.env.STORAGE_BUCKET ?? null,
      endpoint:
        process.env.S3_ENDPOINT ??
        process.env.STORAGE_ENDPOINT ??
        (process.env.CLOUDFLARE_R2_ACCOUNT_ID
          ? `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
          : null),
    });
  } catch (error: any) {
    try {
      await storage.delete(key);
    } catch {
      // Best effort cleanup only.
    }
    return NextResponse.json(
      {
        ok: false,
        error: error.message ?? "Storage test failed.",
      },
      { status: 500 }
    );
  }
}
