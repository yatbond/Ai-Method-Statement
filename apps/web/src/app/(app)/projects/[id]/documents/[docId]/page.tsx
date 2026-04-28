// =============================================================================
// Project document detail — extracted passages browser
//
// Shows every passage extracted from a project document, with content type,
// page, section heading, and embedding status. Useful for verifying OCR
// quality and understanding what content is available for retrieval.
// =============================================================================

import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";

const CONTENT_TYPE_BADGE: Record<string, string> = {
  text:  "bg-gray-100 text-gray-600",
  table: "bg-blue-50 text-blue-700",
  image: "bg-purple-50 text-purple-700",
  diagram: "bg-indigo-50 text-indigo-700",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { docId } = await params;
  const doc = await db.projectDocument.findUnique({ where: { id: docId }, select: { filename: true } });
  return { title: doc?.filename ?? "Document" };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const userId = user.id;

  const [doc, passages] = await Promise.all([
    db.projectDocument.findFirst({
      where: { id: docId, project: { id, members: { some: { userId } } } },
      select: {
        id: true,
        filename: true,
        title: true,
        documentType: true,
        status: true,
        pageCount: true,
        ocrUsed: true,
        extractionErrors: true,
        authorityRank: true,
        uploadedAt: true,
        processedAt: true,
        _count: { select: { sourcePassages: true } },
      },
    }),
    db.sourcePassage.findMany({
      where: { sourceDocumentId: docId },
      orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        pageNumber: true,
        sectionHeading: true,
        contentType: true,
        extractedText: true,
        embeddingModelVersion: true,
      },
    }),
  ]);

  if (!doc) notFound();

  const embeddedCount = passages.filter((p) => p.embeddingModelVersion).length;
  const byPage = passages.reduce<Record<number, typeof passages>>((acc, p) => {
    const page = p.pageNumber ?? 0;
    if (!acc[page]) acc[page] = [];
    acc[page].push(p);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/projects" className="hover:text-gray-600">Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-600">{id}</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${id}/documents`} className="hover:text-gray-600">Documents</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600 truncate">{doc.title ?? doc.filename}</span>
      </nav>

      {/* Document header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{doc.title ?? doc.filename}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{doc.filename}</p>
          </div>
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
              doc.status === "COMPLETE"
                ? "bg-green-50 text-green-700"
                : doc.status === "PROCESSING" || doc.status === "QUEUED"
                ? "bg-blue-50 text-blue-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {doc.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            ["Document type", doc.documentType?.replace(/_/g, " ") ?? "—"],
            ["Authority rank", `Rank ${doc.authorityRank}`],
            ["Pages", doc.pageCount?.toString() ?? "—"],
            ["Passages", doc._count.sourcePassages.toString()],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>OCR: {doc.ocrUsed ? "Yes" : "No"}</span>
          <span>Embedded: {embeddedCount}/{passages.length} passages</span>
          {doc.processedAt && (
            <span>
              Processed{" "}
              {new Date(doc.processedAt).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </span>
          )}
          {doc.extractionErrors && (
            <span className="text-amber-600">Extraction warnings: {String(doc.extractionErrors)}</span>
          )}
        </div>
      </div>

      {/* Passages */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Extracted passages</h2>
          <p className="text-xs text-gray-400">{passages.length} total</p>
        </div>

        {passages.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-400">
              {doc.status === "COMPLETE"
                ? "No passages extracted. The document may be empty or extraction failed."
                : "Document is still processing. Refresh when complete."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(byPage)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([page, pagePassages]) => (
                <div key={page} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">
                      {Number(page) === 0 ? "No page" : `Page ${page}`}
                    </span>
                    <span className="text-xs text-gray-400">{pagePassages.length} passage{pagePassages.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {pagePassages.map((p) => (
                      <div key={p.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              CONTENT_TYPE_BADGE[p.contentType] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {p.contentType}
                          </span>
                          {p.sectionHeading && (
                            <span className="text-xs text-gray-400 italic truncate">{p.sectionHeading}</span>
                          )}
                          {p.embeddingModelVersion && (
                            <span className="ml-auto text-xs text-green-600 shrink-0">✓ embedded</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 font-mono whitespace-pre-wrap">
                          {p.extractedText}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
