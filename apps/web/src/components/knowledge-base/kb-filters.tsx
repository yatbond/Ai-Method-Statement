"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface Props {
  trades: { id: string; name: string }[];
}

export default function KnowledgeBaseFilters({ trades }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page"); // reset page on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <input
        type="search"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder="Search by title, project, client…"
        onChange={(e) => updateParam("q", e.target.value)}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 w-64"
      />

      {/* Trade filter */}
      <select
        defaultValue={searchParams.get("tradeId") ?? ""}
        onChange={(e) => updateParam("tradeId", e.target.value)}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All trades</option>
        {trades.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {(searchParams.get("q") || searchParams.get("tradeId")) && (
        <button
          onClick={() => {
            const params = new URLSearchParams();
            router.push(pathname);
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
