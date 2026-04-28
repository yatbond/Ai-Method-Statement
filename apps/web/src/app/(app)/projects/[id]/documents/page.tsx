import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import DocumentUploader from "@/components/documents/document-uploader";
import DocumentList from "@/components/documents/document-list";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { name: true } });
  return { title: `Documents — ${project?.name ?? "Project"}` };
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  const userId = user!.id;

  const project = await db.project.findFirst({
    where: { id, members: { some: { userId } }, archivedAt: null },
    select: { id: true, name: true },
  });

  if (!project) notFound();

  const documents = await db.projectDocument.findMany({
    where: { projectId: id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      filename: true,
      fileSize: true,
      mimeType: true,
      documentType: true,
      status: true,
      pageCount: true,
      ocrUsed: true,
      extractionErrors: true,
      uploadedAt: true,
      processedAt: true,
      authorityRank: true,
    },
  });

  // Serialise dates for the client component
  const serialised = documents.map((d) => ({
    ...d,
    uploadedAt: d.uploadedAt.toISOString(),
    processedAt: d.processedAt?.toISOString() ?? null,
  }));

  const counts = {
    complete: documents.filter((d) => d.status === "COMPLETE").length,
    processing: documents.filter(
      (d) => d.status === "QUEUED" || d.status === "PROCESSING"
    ).length,
    error: documents.filter((d) => d.status === "ERROR").length,
  };

  return (
    <div className="max-w-4xl">
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/projects" className="hover:text-gray-600">Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-600">{project.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">Documents</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Project Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload contracts, specifications, drawings, risk assessments, and programmes.
            These are ingested and used as authoritative sources during drafting.
          </p>
        </div>
      </div>

      {/* Stats */}
      {documents.length > 0 && (
        <div className="flex items-center gap-6 mb-6 text-sm">
          <span className="text-gray-500">{documents.length} total</span>
          {counts.complete > 0 && (
            <span className="text-green-600">✓ {counts.complete} processed</span>
          )}
          {counts.processing > 0 && (
            <span className="text-blue-600 animate-pulse">⚙ {counts.processing} processing</span>
          )}
          {counts.error > 0 && (
            <span className="text-red-600">✗ {counts.error} failed</span>
          )}
        </div>
      )}

      {/* Source authority note */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 mb-6">
        <strong>Source authority hierarchy:</strong> Contract (rank 1) &gt; Specification (2) &gt;
        Drawing (3) &gt; Risk Assessment (4) &gt; Programme / Site Constraints (5).
        Higher-ranked documents override lower-ranked precedent in conflict detection.
      </div>

      {/* Upload */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload documents</h2>
        <DocumentUploader projectId={id} />
      </div>

      {/* Document list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Uploaded documents
        </h2>
        <DocumentList
          projectId={id}
          initialDocuments={serialised as any}
        />
      </div>
    </div>
  );
}
