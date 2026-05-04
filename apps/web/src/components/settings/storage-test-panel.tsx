"use client";

import { useState } from "react";

type TestResult = {
  ok: boolean;
  provider?: string;
  bucket?: string | null;
  endpoint?: string | null;
  error?: string;
};

export default function StorageTestPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function testStorage() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings/storage/test", { method: "POST" });
      const data = await res.json();
      setResult(data);
      if (!res.ok) throw new Error(data.error ?? "Storage test failed.");
    } catch (error: any) {
      setResult({ ok: false, error: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">File Storage</h2>
          <p className="mt-1 text-xs text-gray-400">
            Test the configured local, S3, or Cloudflare R2 storage by writing and deleting a small health-check file.
          </p>
        </div>
        <button
          type="button"
          onClick={testStorage}
          disabled={busy}
          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Testing..." : "Test Storage"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
            result.ok
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? (
            <div>
              Storage test passed.
              <span className="ml-2 text-emerald-700">
                Provider: {result.provider ?? "unknown"}
                {result.bucket ? `; bucket: ${result.bucket}` : ""}
                {result.endpoint ? `; endpoint: ${result.endpoint}` : ""}
              </span>
            </div>
          ) : (
            <div>{result.error ?? "Storage test failed."}</div>
          )}
        </div>
      )}
    </section>
  );
}
