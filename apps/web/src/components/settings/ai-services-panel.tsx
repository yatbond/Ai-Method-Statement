"use client";

import { useEffect, useState } from "react";

type Service = {
  key: string;
  provider: string;
  providers: string[];
  model: string;
  models: string[];
  baseURL: string;
  providerDefaults: Record<string, { model: string; baseURL: string; models: string[] }>;
  apiKeyName: string | null;
  apiKeySet: boolean;
};

type Backup = {
  name: string;
  createdAt: string;
};

const SERVICE_LABELS: Record<string, string> = {
  embedding: "Embedding / Retrieval Index",
  llm: "Drafting LLM",
  documentAI: "Document AI",
  imageGen: "Visual Generation",
};

export default function AIServicesPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [envWritable, setEnvWritable] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<Service> & { apiKey?: string }>>({});
  const [customModelDrafts, setCustomModelDrafts] = useState<Record<string, string>>({});
  const [restoreName, setRestoreName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/settings/ai-services", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load AI services.");
    setServices(data.services);
    setBackups(data.backups);
    setEnvWritable(data.envWritable !== false);
    setDrafts(
      Object.fromEntries(
        data.services.map((service: Service) => [
          service.key,
          {
            provider: service.provider,
            model: service.model,
            baseURL: service.baseURL,
            apiKey: "",
          },
        ])
      )
    );
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  function setDraft(serviceKey: string, patch: Partial<Service> & { apiKey?: string }) {
    setDrafts((current) => ({
      ...current,
      [serviceKey]: { ...current[serviceKey], ...patch },
    }));
  }

  function changeProvider(service: Service, provider: string) {
    const defaults = service.providerDefaults[provider] ?? { model: "", baseURL: "", models: [] };
    setDraft(service.key, {
      provider,
      model: defaults.model,
      baseURL: defaults.baseURL,
    });
    setCustomModelDrafts((current) => ({ ...current, [service.key]: "" }));
  }

  function changeModel(service: Service, value: string) {
    if (value === "__custom__") {
      setCustomModelDrafts((current) => ({
        ...current,
        [service.key]: String(drafts[service.key]?.model ?? service.model ?? ""),
      }));
      return;
    }
    setCustomModelDrafts((current) => ({ ...current, [service.key]: "" }));
    setDraft(service.key, { model: value });
  }

  async function save(service: Service) {
    if (!envWritable) {
      setMessage("Hosted production uses Railway environment variables. Update AI provider settings in Railway, then redeploy or restart the affected service.");
      return;
    }
    if (!window.confirm("Save provider settings to .env? A backup will be created first.")) return;
    setBusy(service.key);
    setMessage("");
    try {
      const draft = drafts[service.key] ?? {};
      const res = await fetch("/api/settings/ai-services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: service.key,
          provider: draft.provider,
          model: draft.model,
          baseURL: draft.baseURL,
          apiKey: draft.apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save provider settings.");
      setMessage("Saved. New ingestion jobs will use these provider settings.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!restoreName) return;
    if (!envWritable) {
      setMessage("Hosted production cannot restore .env backups. Update Railway environment variables instead.");
      return;
    }
    if (!window.confirm("Restore this .env backup? The current .env will be backed up first.")) return;
    setBusy("restore");
    setMessage("");
    try {
      const res = await fetch("/api/settings/ai-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupName: restoreName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to restore backup.");
      setRestoreName("");
      setMessage("Backup restored. Restart the dev server for changes to take effect.");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-700">AI Services</h2>
        <p className="mt-1 text-xs text-slate-400">
          {envWritable
            ? "Provider settings are written to the repo root .env file after you press Save."
            : "Hosted production saves provider settings encrypted in the application database."}
        </p>
      </div>

      <div className="space-y-4">
        {services.map((service) => {
          const draft = drafts[service.key] ?? {};
          const selectedProvider = String(draft.provider ?? service.provider);
          const selectedProviderDefaults = service.providerDefaults[selectedProvider] ?? {
            model: "",
            baseURL: "",
            models: [],
          };
          const modelOptions = Array.from(
            new Set([
              ...selectedProviderDefaults.models,
              ...(selectedProvider === service.provider ? service.models : []),
              String(draft.model ?? service.model ?? ""),
            ].filter(Boolean))
          );
          const customModel = customModelDrafts[service.key] ?? "";
          return (
            <div key={service.key} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    {SERVICE_LABELS[service.key] ?? service.key}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    API key: {service.apiKeyName ?? "not required"} / {service.apiKeySet ? "set" : "not set"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => save(service)}
                  disabled={busy === service.key}
                  className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-slate-500">
                  Provider
                  <select
                    value={selectedProvider}
                    onChange={(event) => changeProvider(service, event.target.value)}
                    disabled={service.key === "embedding"}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    {service.providers.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Model
                  <select
                    value={customModel ? "__custom__" : String(draft.model ?? service.model ?? "")}
                    onChange={(event) => changeModel(service, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                    {service.key !== "embedding" && <option value="__custom__">Add custom model...</option>}
                  </select>
                  {customModel !== "" && (
                    <input
                      value={customModel}
                      onChange={(event) => {
                        setCustomModelDrafts((current) => ({ ...current, [service.key]: event.target.value }));
                        setDraft(service.key, { model: event.target.value });
                      }}
                      placeholder="custom model name"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    />
                  )}
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Base URL
                  <input
                    value={String(draft.baseURL ?? "")}
                    onChange={(event) => setDraft(service.key, { baseURL: event.target.value })}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  API key
                  <input
                    type="password"
                    value={String(draft.apiKey ?? "")}
                    onChange={(event) => setDraft(service.key, { apiKey: event.target.value })}
                    placeholder={service.apiKeySet ? "leave blank to keep current key" : "enter key"}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-950">.env Backup</h3>
        <div className="flex gap-2">
          <select
            value={restoreName}
            onChange={(event) => setRestoreName(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
          >
            <option value="">Select backup</option>
            {backups.map((backup) => (
              <option key={backup.name} value={backup.name}>
                {backup.name} ({new Date(backup.createdAt).toLocaleString()})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={restore}
            disabled={!restoreName || busy === "restore" || !envWritable}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Restore
          </button>
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </section>
  );
}
