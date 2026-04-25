// GET — download the exported .docx file via presigned URL or direct stream

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@ams/database";
import { createStorageProvider } from "@ams/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ msId: string; exportId: string }> }
) {
  const { msId, exportId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any)?.id as string;

  const ms = await db.methodStatement.findFirst({
    where: { id: msId, project: { members: { some: { userId } } } },
    select: { id: true, title: true },
  });
  if (!ms) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const exportRecord = await db.exportRecord.findFirst({
    where: { id: exportId, methodStatementId: msId },
    select: { fileKey: true },
  });
  if (!exportRecord) return NextResponse.json({ error: "Export not found." }, { status: 404 });

  const storage = createStorageProvider();

  try {
    // Try presigned URL first (S3/MinIO)
    const presigned = await storage.presignedUrl(exportRecord.fileKey, 300);
    return NextResponse.redirect(presigned);
  } catch {
    // Fallback: stream the file directly
    const fileBuffer = await storage.download(exportRecord.fileKey);
    const filename = `${ms.title.replace(/[^a-z0-9]/gi, "_")}.docx`;

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  }
}
