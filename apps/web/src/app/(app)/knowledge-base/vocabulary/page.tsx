// =============================================================================
// Vocabulary management page (P11 — v1.1)
//
// Lists and manages VocabularyTerm records used by the specificity engine.
// Terms are trade-scoped or global. Prohibited terms are flagged during drafting
// and specificity checks with suggested replacements.
// =============================================================================

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@ams/database";
import VocabularyManager from "@/components/knowledge-base/vocabulary-manager";

export const metadata = { title: "Vocabulary — AMS Studio" };

export default async function VocabularyPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [terms, trades] = await Promise.all([
    db.vocabularyTerm.findMany({
      orderBy: [{ category: "asc" }, { preferredTerm: "asc" }],
    }),
    db.trade.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const grouped = terms.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl">
      <nav className="text-sm text-gray-400 mb-2">
        <Link href="/knowledge-base" className="hover:text-gray-600">Knowledge Base</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">Vocabulary</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Vocabulary Control</h1>
          <p className="text-sm text-gray-500 mt-1">
            Preferred terms and prohibited alternatives. Used by the specificity engine during drafting and quality checks.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          <span className="font-semibold text-gray-900">{terms.length}</span> total terms
        </div>
      </div>

      {/* Category summary pills */}
      {Object.keys(grouped).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(grouped).map(([cat, count]) => (
            <span key={cat} className="text-xs px-3 py-1 rounded-full bg-white border border-gray-200 text-gray-600">
              {cat} <span className="font-semibold text-gray-900 ml-1">{count}</span>
            </span>
          ))}
        </div>
      )}

      <VocabularyManager
        initialTerms={terms.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }))}
        trades={trades}
      />
    </div>
  );
}
