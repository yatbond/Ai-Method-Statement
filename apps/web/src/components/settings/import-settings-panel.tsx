"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Trade = {
  id: string;
  name: string;
  description: string | null;
  _count: { historicalMS: number; methodStatements: number };
};

type Source = {
  tradeId: string;
  folderPath: string;
  enabled: boolean;
  updatedAt: string;
};

type Job = {
  id: string;
  status: string;
  queue?: {
    bullmqJobId: string | null;
    state: string | null;
    progress: number | null;
    canCancel: boolean;
  };
  payload: any;
  result: any;
  errorMessage: string | null;
  attempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  indexing?: {
    stage: "NO_PASSAGES" | "EMBEDDINGS_MISSING" | "PARTIAL" | "READY";
    ready: boolean;
    passageCount: number;
    embeddedCount: number;
    missingCount: number;
    modelVersion: string | null;
    message: string;
  } | null;
};

type JobMeta = {
  scope: "latest" | "all";
  batch: {
    id: string | null;
    mode: "exact" | "time-window";
    label: string;
    startedAt: string;
    tradeId: string | null;
  } | null;
  limit: number;
  shown: number;
  total: number;
  statusCounts: Record<string, number>;
};

type FolderListing = {
  currentPath: string;
  parentPath: string | null;
  roots: Array<{ name: string; path: string }>;
  folders: Array<{ name: string; path: string }>;
  pdfCount: number;
};

type IngestionSettings = {
  batchPages: number;
  requestDelaySeconds: number;
  parallelRequests: number;
  attempts: number;
  retryDelaySeconds: number;
  adaptiveSplit: boolean;
  checkpointing: boolean;
  maxProviderPagesPerRequest: number;
  maxProviderPdfMbPerRequest: number;
  parallelRestartRequired: boolean;
};

type UploadImportResult = {
  results?: Array<{
    tradeId: string;
    file: string;
    status: "queued" | "skipped" | "failed";
    message?: string;
  }>;
  queued?: number;
  skipped?: number;
  failed?: number;
  message?: string;
  error?: string;
};

type PresignedUploadResult = {
  uploadUrl?: string;
  fileKey?: string;
  contentType?: string;
  error?: string;
};

export default function ImportSettingsPanel() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobMeta, setJobMeta] = useState<JobMeta | null>(null);
  const [jobScope, setJobScope] = useState<"latest" | "all">("latest");
  const [ingestionSettings, setIngestionSettings] = useState<IngestionSettings | null>(null);
  const [envWritable, setEnvWritable] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState({
    batchPages: 20,
    requestDelaySeconds: 60,
    parallelRequests: 3,
  });
  const [settingsDraftDirtyState, setSettingsDraftDirtyState] = useState(false);
  const [jobLimit, setJobLimit] = useState(250);
  const [newTrade, setNewTrade] = useState("");
  const [folderDrafts, setFolderDrafts] = useState<Record<string, string>>({});
  const [uploadFilesByTrade, setUploadFilesByTrade] = useState<Record<string, File[]>>({});
  const [folderPickerTradeId, setFolderPickerTradeId] = useState<string | null>(null);
  const [folderListing, setFolderListing] = useState<FolderListing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [reembedFeedbackByJobId, setReembedFeedbackByJobId] = useState<Record<string, string>>({});
  const dirtyFolderTradeIds = useRef(new Set<string>());
  const settingsDraftDirty = useRef(false);
  const busyRef = useRef<string | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  function markSettingsDraftDirty() {
    settingsDraftDirty.current = true;
    setSettingsDraftDirtyState(true);
  }

  async function load() {
    const res = await fetch(`/api/settings/import?limit=${jobLimit}&batchScope=${jobScope}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load import settings.");
    setTrades(data.trades);
    setSources(data.sources);
    setJobs(data.jobs);
    setJobMeta(data.jobMeta ?? null);
    setEnvWritable(data.envWritable !== false);
    if (data.ingestionSettings) {
      setIngestionSettings(data.ingestionSettings);
      setSettingsDraft((current) => {
        if (
          settingsDraftDirty.current ||
          settingsDraftDirtyState ||
          busyRef.current === "save-ingestion-settings"
        ) {
          return current;
        }
        return {
          batchPages: data.ingestionSettings.batchPages,
          requestDelaySeconds: data.ingestionSettings.requestDelaySeconds,
          parallelRequests: data.ingestionSettings.parallelRequests,
        };
      });
    }
    setFolderDrafts((current) => {
      const next = { ...current };
      for (const source of data.sources as Source[]) {
        if (!dirtyFolderTradeIds.current.has(source.tradeId)) {
          next[source.tradeId] = source.folderPath;
        }
      }
      return next;
    });
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [jobLimit, jobScope, settingsDraftDirtyState]);

  const sourceByTrade = useMemo(
    () => new Map(sources.map((source) => [source.tradeId, source])),
    [sources]
  );
  const stoppableJobs = useMemo(() => jobs.filter(canTerminateJob), [jobs]);

  async function addTrade() {
    if (!newTrade.trim()) return;
    setBusy("add-trade");
    setMessage("");
    try {
      const res = await fetch("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTrade.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add trade.");
      setNewTrade("");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveFolder(tradeId: string, enabled = true, folderPath = folderDrafts[tradeId] ?? "") {
    setBusy(`folder-${tradeId}`);
    setMessage("");
    try {
      const data = await saveFolderRequest(tradeId, enabled, folderPath);
      dirtyFolderTradeIds.current.delete(tradeId);
      setFolderDrafts((drafts) => ({ ...drafts, [tradeId]: data.folderPath }));
      setMessage(`Saved ${data.folderPath || "empty folder mapping"}.`);
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteTrade(tradeId: string) {
    if (!window.confirm("Delete this trade? Linked records will block deletion.")) return;
    setBusy(`delete-${tradeId}`);
    setMessage("");
    try {
      const res = await fetch(`/api/settings/import?tradeId=${encodeURIComponent(tradeId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete trade.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function ingest(tradeId?: string) {
    setBusy(tradeId ? `ingest-${tradeId}` : "ingest-all");
    setMessage("");
    try {
      if (tradeId) {
        const draftPath = folderDrafts[tradeId] ?? "";
        const source = sourceByTrade.get(tradeId);
        if (!draftPath.trim()) {
          throw new Error("Choose a source folder before ingestion.");
        }
        if (!source || source.folderPath !== draftPath) {
          const saved = await saveFolderRequest(tradeId, true, draftPath);
          dirtyFolderTradeIds.current.delete(tradeId);
          setFolderDrafts((drafts) => ({ ...drafts, [tradeId]: saved.folderPath }));
        }
      }

      const res = await fetch("/api/settings/import/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger ingestion.");
      setMessage(data.message ?? `Queued ${data.queued}; skipped ${data.skipped}; failed ${data.failed}.`);
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadAndIngest(tradeId: string) {
    const files = uploadFilesByTrade[tradeId] ?? [];
    if (files.length === 0) {
      setMessage("Choose one or more PDF files before upload import.");
      return;
    }

    setBusy(`upload-${tradeId}`);
    setMessage("");
    try {
      const totals = { queued: 0, skipped: 0, failed: 0 };
      const importRunId = crypto.randomUUID();
      const importRunStartedAt = new Date().toISOString();

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const contentType = file.type || "application/pdf";
        setMessage(`Preparing ${index + 1} of ${files.length}: ${file.name}`);

        const sourceFingerprint = await sha256Hex(file);
        const presignRes = await fetch("/api/settings/import/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId,
            filename: file.name,
            contentType,
            size: file.size,
          }),
        });
        const presign = (await presignRes.json().catch(() => ({}))) as PresignedUploadResult;
        if (!presignRes.ok || !presign.uploadUrl || !presign.fileKey) {
          throw new Error(presign.error ?? `Failed to prepare upload for ${file.name}.`);
        }

        setMessage(`Uploading ${index + 1} of ${files.length} to storage: ${file.name}`);
        const uploadRes = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": presign.contentType ?? contentType },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error(`Storage upload failed for ${file.name} (${uploadRes.status}).`);
        }

        setMessage(`Queueing ${index + 1} of ${files.length}: ${file.name}`);
        const res = await fetch("/api/settings/import/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId,
            filename: file.name,
            contentType,
            size: file.size,
            fileKey: presign.fileKey,
            sourceFingerprint,
            importRunId,
            importRunStartedAt,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as UploadImportResult;
        if (!res.ok) {
          throw new Error(data.error ?? `Failed to upload and queue ${file.name}.`);
        }

        totals.queued += data.queued ?? 0;
        totals.skipped += data.skipped ?? 0;
        totals.failed += data.failed ?? 0;
      }

      setUploadFilesByTrade((current) => ({ ...current, [tradeId]: [] }));
      setMessage(`Queued ${totals.queued}; skipped ${totals.skipped}; failed ${totals.failed}.`);
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelJob(job: Job) {
    const filename = job.payload?.filename ?? job.payload?.localSourcePath ?? job.payload?.historicalMSId ?? "this job";
    if (!window.confirm(`Terminate ingestion for ${filename}?`)) return;

    setBusy(`cancel-${job.id}`);
    setMessage("");
    try {
      const res = await fetch(`/api/settings/import/jobs/${encodeURIComponent(job.id)}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to terminate ingestion.");
      setMessage(data.message ?? "Ingestion terminated.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function reembedJob(job: Job) {
    setBusy(`reembed-${job.id}`);
    setMessage("");
    try {
      const res = await fetch(`/api/settings/import/jobs/${encodeURIComponent(job.id)}/reembed`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to queue embeddings.");
      const feedback = data.message ?? `Queued ${data.passageCount} passages for ${data.modelVersion} embedding.`;
      setMessage(feedback);
      setReembedFeedbackByJobId((current) => ({ ...current, [job.id]: feedback }));
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelAllIngestion() {
    if (!window.confirm("Terminate all active, queued, waiting, and retrying import ingestion jobs?")) return;

    setBusy("cancel-all");
    setMessage("");
    try {
      const res = await fetch("/api/settings/import/jobs/cancel-active", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to terminate ingestion.");
      setMessage(data.message ?? "Ingestion jobs terminated.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function openFolderPicker(tradeId: string, initialPath?: string) {
    setFolderPickerTradeId(tradeId);
    await browseFolder(initialPath);
  }

  async function browseFolder(folderPath?: string) {
    setMessage("");
    try {
      const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : "";
      const res = await fetch(`/api/settings/import/folders${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open folder.");
      setFolderListing(data);
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function chooseCurrentFolder() {
    if (!folderPickerTradeId || !folderListing) return;
    const tradeId = folderPickerTradeId;
    const folderPath = folderListing.currentPath;
    setFolderDrafts((drafts) => ({
      ...drafts,
      [tradeId]: folderPath,
    }));
    dirtyFolderTradeIds.current.add(tradeId);
    setFolderPickerTradeId(null);
    setFolderListing(null);
    await saveFolder(tradeId, true, folderPath);
  }

  async function saveFolderRequest(tradeId: string, enabled: boolean, folderPath: string): Promise<Source> {
    const res = await fetch("/api/settings/import", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId, folderPath, enabled }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save folder.");
    return data;
  }

  async function saveIngestionSettings() {
    if (!envWritable) {
      setMessage("Hosted production uses Railway environment variables. Update Document AI settings in Railway and restart the worker.");
      return;
    }
    if (!window.confirm("Save ingestion settings to .env? A backup will be created first.")) return;
    setBusy("save-ingestion-settings");
    setMessage("");
    try {
      const res = await fetch("/api/settings/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionSettings: settingsDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save ingestion settings.");
      setIngestionSettings(data.ingestionSettings);
      settingsDraftDirty.current = false;
      setSettingsDraftDirtyState(false);
      setSettingsDraft({
        batchPages: data.ingestionSettings.batchPages,
        requestDelaySeconds: data.ingestionSettings.requestDelaySeconds,
        parallelRequests: data.ingestionSettings.parallelRequests,
      });
      setMessage(data.message ?? "Ingestion settings saved.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Import</h2>
          <p className="mt-1 text-xs text-slate-400">Historical method statement uploads and local development folders by trade.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancelAllIngestion}
            disabled={busy === "cancel-all"}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
          >
            Terminate All
          </button>
          <button
            type="button"
            onClick={() => ingest()}
            disabled={busy !== null}
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Ingest Enabled Folders
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Document AI Settings</h3>
            <p className="mt-1 text-xs text-slate-400">
              These settings only control Document AI OCR parsing for PDF imports. They do not change Drafting LLM, embeddings, or other AI services.
              {!envWritable && " Hosted production reads these from Railway environment variables."}
            </p>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <SettingFact label="First OCR pass" value={`${settingsDraftDirtyState ? settingsDraft.batchPages : ingestionSettings?.batchPages ?? settingsDraft.batchPages} pages per OCR batch`} />
              <SettingFact label="Cascade" value="Failed batch halves until one page" />
              <SettingFact label="Checkpoint" value={ingestionSettings?.checkpointing ? "Save each successful batch" : "Off"} />
              <SettingFact
                label="Retry"
                value={`${ingestionSettings?.attempts ?? 3} attempts; ${formatDuration(ingestionSettings?.retryDelaySeconds ?? 600)} initial wait`}
              />
              <SettingFact
                label="Provider limit"
                value={`${ingestionSettings?.maxProviderPdfMbPerRequest ?? 50} MB / ${ingestionSettings?.maxProviderPagesPerRequest ?? 100} pages`}
              />
              <SettingFact
                label={settingsDraftDirtyState ? "Unsaved OCR draft" : "Saved OCR throttle"}
                value={`${settingsDraftDirtyState ? settingsDraft.parallelRequests : ingestionSettings?.parallelRequests ?? settingsDraft.parallelRequests} documents; ${settingsDraftDirtyState ? settingsDraft.requestDelaySeconds : ingestionSettings?.requestDelaySeconds ?? settingsDraft.requestDelaySeconds}s delay`}
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-medium text-slate-600">
                OCR parallel docs
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.parallelRequests}
                  onChange={(event) => {
                    markSettingsDraftDirty();
                    setSettingsDraft((draft) => ({ ...draft, parallelRequests: Number(event.target.value) }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                OCR delay sec
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={settingsDraft.requestDelaySeconds}
                  onChange={(event) => {
                    markSettingsDraftDirty();
                    setSettingsDraft((draft) => ({ ...draft, requestDelaySeconds: Number(event.target.value) }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                OCR batch pages
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settingsDraft.batchPages}
                  onChange={(event) => {
                    markSettingsDraftDirty();
                    setSettingsDraft((draft) => ({ ...draft, batchPages: Number(event.target.value) }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={saveIngestionSettings}
              disabled={busy === "save-ingestion-settings" || !envWritable}
              className="mt-3 w-full rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {envWritable ? "Save Document AI Settings" : "Managed In Railway"}
            </button>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              {envWritable
                ? "Saved values update Document AI OCR env vars only. Restart the worker before starting another import so PDF OCR uses the new limits."
                : "Change these values in the Railway web and worker service environment variables, then redeploy or restart the worker."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex gap-2 border-b border-slate-100 p-4">
          <input
            value={newTrade}
            onChange={(event) => setNewTrade(event.target.value)}
            placeholder="New trade name"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addTrade}
            disabled={busy === "add-trade"}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Add
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {trades.map((trade) => {
            const source = sourceByTrade.get(trade.id);
            return (
              <div key={trade.id} className="grid gap-3 p-4 lg:grid-cols-[220px_1fr_auto]">
                <div>
                  <div className="text-sm font-medium text-slate-950">{trade.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {trade._count.historicalMS} precedent / {trade._count.methodStatements} drafts
                  </div>
                </div>
                <div className="grid min-w-0 gap-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          setUploadFilesByTrade((current) => ({ ...current, [trade.id]: files }));
                        }}
                        className="min-w-0 flex-1 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => uploadAndIngest(trade.id)}
                        disabled={(uploadFilesByTrade[trade.id]?.length ?? 0) === 0 || busy === `upload-${trade.id}`}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Upload & Ingest
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-emerald-800">
                      Web app import: select PDF files from your computer. The app uploads them to storage, skips matching completed uploads by file hash, and queues Document AI OCR.
                      {(uploadFilesByTrade[trade.id]?.length ?? 0) > 0 &&
                        ` Selected ${uploadFilesByTrade[trade.id].length} file${uploadFilesByTrade[trade.id].length === 1 ? "" : "s"}.`}
                    </div>
                  </div>

                  <div className="flex min-w-0 gap-2">
                    <input
                      value={folderDrafts[trade.id] ?? ""}
                      onChange={(event) => {
                        dirtyFolderTradeIds.current.add(trade.id);
                        setFolderDrafts((drafts) => ({ ...drafts, [trade.id]: event.target.value }));
                      }}
                      placeholder="Local dev only: browse or paste a server folder path"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => openFolderPicker(trade.id, folderDrafts[trade.id])}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      Browse
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveFolder(trade.id, source?.enabled ?? true)}
                    disabled={busy === `folder-${trade.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => ingest(trade.id)}
                    disabled={!(folderDrafts[trade.id] ?? "").trim() || busy === `ingest-${trade.id}`}
                    className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Ingest Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTrade(trade.id)}
                    disabled={busy === `delete-${trade.id}`}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {trades.length === 0 && <div className="p-6 text-sm text-slate-400">No trades configured.</div>}
        </div>
      </div>

      {folderPickerTradeId && folderListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
          <div className="max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Choose Source Folder</h3>
                  <p className="mt-1 break-all text-xs text-slate-500">{folderListing.currentPath}</p>
                  <p className="mt-1 text-xs text-slate-400">{folderListing.pdfCount} PDF files in this folder</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFolderPickerTradeId(null);
                    setFolderListing(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {folderListing.roots.map((root) => (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() => browseFolder(root.path)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {root.name}
                  </button>
                ))}
                {folderListing.parentPath && (
                  <button
                    type="button"
                    onClick={() => browseFolder(folderListing.parentPath!)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Up
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[46vh] overflow-y-auto p-2">
              {folderListing.folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  onClick={() => browseFolder(folder.path)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{folder.name}</span>
                  <span className="text-slate-300">Open</span>
                </button>
              ))}
              {folderListing.folders.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-slate-400">No subfolders here.</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={chooseCurrentFolder}
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
              >
                Use This Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

      <div className="mt-5 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">Ingestion Runs</div>
            <div className="mt-1 text-xs text-slate-400">
              {jobMeta
                ? `Showing ${jobMeta.shown} of ${jobMeta.total} ${jobScope === "latest" ? "batch" : "total"} runs; ${stoppableJobs.length} active, queued, or retrying`
                : `${stoppableJobs.length} active, queued, or retrying`}
            </div>
            {jobScope === "latest" && jobMeta?.batch && (
              <div className="mt-1 text-[11px] text-slate-400">
                {jobMeta.batch.label}
                {jobMeta.batch.mode === "time-window" ? " (estimated from older jobs)" : ""}
              </div>
            )}
            {jobMeta && (
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                {["PENDING", "RUNNING", "RETRYING", "COMPLETE", "FAILED", "CANCELLED"].map((status) => (
                  <span key={status}>{status}: {jobMeta.statusCounts[status] ?? 0}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={jobScope}
              onChange={(event) => setJobScope(event.target.value === "all" ? "all" : "latest")}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700"
            >
              <option value="latest">Latest batch</option>
              <option value="all">All runs</option>
            </select>
            <select
              value={jobLimit}
              onChange={(event) => setJobLimit(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700"
            >
              <option value={100}>Latest 100</option>
              <option value={250}>Latest 250</option>
              <option value={500}>Latest 500</option>
              <option value={1000}>Latest 1000</option>
            </select>
            <button
              type="button"
              onClick={() => load().catch((error) => setMessage(error.message))}
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Result</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="max-w-[280px] truncate px-4 py-2 text-slate-700">
                    {job.payload?.filename ?? job.payload?.localSourcePath ?? job.payload?.historicalMSId}
                  </td>
                  <td className="min-w-[150px] px-4 py-2">
                    <div className="font-medium text-slate-700">{displayJobStatus(job)}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {job.queue?.state ? `Queue: ${job.queue.state}` : terminalStatus(job.status) ? "Queue: finished" : "Queue: not found"}
                    </div>
                    {typeof job.queue?.progress === "number" && (
                      <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(0, Math.min(100, job.queue.progress))}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {job.errorMessage ? (
                      job.errorMessage
                    ) : (
                      <div>
                        <div>
                          {job.result
                            ? `${job.result.passageCount ?? 0} passages / ${job.result.pageCount ?? 0} pages`
                            : "-"}
                        </div>
                        {job.indexing && (
                          <div className={job.indexing.ready ? "mt-1 text-[11px] text-emerald-600" : "mt-1 text-[11px] text-amber-700"}>
                            {job.indexing.message}
                            {job.indexing.passageCount > 0 && (
                              <span>
                                {" "}
                                ({job.indexing.embeddedCount}/{job.indexing.passageCount})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(job.completedAt ?? job.startedAt ?? job.scheduledAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    {canTerminateJob(job) ? (
                      <button
                        type="button"
                        onClick={() => cancelJob(job)}
                        disabled={busy === `cancel-${job.id}`}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    ) : job.indexing && !job.indexing.ready && job.indexing.passageCount > 0 ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => reembedJob(job)}
                          disabled={busy === `reembed-${job.id}`}
                          className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50"
                        >
                          {busy === `reembed-${job.id}` ? "Queueing..." : "Re-run Embeddings"}
                        </button>
                        {reembedFeedbackByJobId[job.id] && (
                          <div className="mt-1 max-w-[220px] text-[11px] leading-4 text-slate-500">
                            {reembedFeedbackByJobId[job.id]}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    No ingestion runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function terminalStatus(status: string) {
  return ["COMPLETE", "FAILED", "CANCELLED"].includes(status);
}

function displayJobStatus(job: Job) {
  if (job.status === "FAILED" && job.queue?.state === "delayed") return "RETRYING";
  if (job.status === "FAILED" && job.queue?.state === "waiting") return "PENDING";
  if (job.status === "FAILED" && job.queue?.state === "active") return "RUNNING";
  return job.status;
}

function canTerminateJob(job: Job) {
  if (job.queue?.canCancel) return true;
  if (["PENDING", "RUNNING", "RETRYING"].includes(job.status)) return true;
  return job.status === "FAILED" && ["waiting", "active", "delayed", "paused", "prioritized", "waiting-children"].includes(job.queue?.state ?? "");
}

function SettingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2">
      <div className="text-[11px] uppercase text-slate-400">{label}</div>
      <div className="mt-1 font-medium text-slate-700">{value}</div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr`;
}
