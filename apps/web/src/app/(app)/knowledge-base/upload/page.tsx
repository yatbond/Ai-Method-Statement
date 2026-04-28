import { getAuthUser } from "@/lib/auth";
import { db } from "@ams/database";
import Link from "next/link";
import HistoricalMSUploadForm from "@/components/knowledge-base/historical-ms-upload";

export const metadata = { title: "Upload to Knowledge Base" };

export default async function KBUploadPage() {
  // auth guard handled by Clerk middleware and layout

  const trades = await db.trade.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-2xl">
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/knowledge-base" className="hover:text-gray-600">Knowledge Base</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">Upload</span>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Upload to Knowledge Base
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload approved historical method statements. Only documents with
        confirmed approval status should be added. AI-generated metadata tags
        will be created automatically and can be reviewed before KB admission.
      </p>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 mb-6">
        <strong>REQ-ING-006:</strong> Bulk historical ingestion is gated. Upload
        a curated seed set per trade first and validate quality before running at
        corpus scale.
      </div>

      <HistoricalMSUploadForm trades={trades} />
    </div>
  );
}
