import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  addAIModelOption,
  canWriteRuntimeEnv,
  listEnvBackups,
  readAIModelOptions,
  readEnvFile,
  restoreEnvBackup,
  updateEnvFile,
} from "@/lib/settings-files";

const PROVIDER_DEFAULTS = {
  anthropic: {
    baseURL: "",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  ollama: {
    baseURL: "http://localhost:11434",
    models: ["glm-ocr", "kimi-k2.6:cloud", "llama3.3:70b", "qwen3:latest"],
  },
  native: {
    baseURL: "",
    models: ["native"],
  },
  gemini: {
    baseURL: "",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"],
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    models: ["anthropic/claude-3.5-sonnet", "google/gemini-2.5-flash", "openai/gpt-4o-mini"],
  },
  zai: {
    baseURL: "https://api.z.ai/api/paas/v4",
    models: ["glm-ocr"],
  },
} as const;

const SERVICES = {
  llm: {
    providerKey: "LLM_PROVIDER",
    modelKey: "LLM_MODEL",
    baseURLKey: "LLM_BASE_URL",
    providers: {
      anthropic: { apiKey: "ANTHROPIC_API_KEY", modelKey: "LLM_MODEL", defaultModel: "claude-3-5-sonnet-latest" },
      openai: { apiKey: "OPENAI_API_KEY", modelKey: "LLM_MODEL", baseURLKey: "LLM_BASE_URL", defaultModel: "gpt-4o", defaultBaseURL: "https://api.openai.com/v1" },
      ollama: { apiKey: "OLLAMA_API_KEY", modelKey: "OLLAMA_MODEL", baseURLKey: "OLLAMA_BASE_URL", defaultModel: "kimi-k2.6:cloud", defaultBaseURL: "https://ollama.com/v1" },
    },
  },
  documentAI: {
    providerKey: "DOCUMENT_AI_PROVIDER",
    modelKey: "DOCUMENT_AI_MODEL",
    baseURLKey: "DOCUMENT_AI_BASE_URL",
    providers: {
      native: { defaultModel: "native" },
      gemini: { apiKey: "DOCUMENT_AI_API_KEY", defaultModel: "gemini-2.5-flash" },
      ollama: { baseURLKey: "DOCUMENT_AI_BASE_URL", defaultModel: "glm-ocr", defaultBaseURL: "http://localhost:11434" },
      openrouter: { apiKey: "DOCUMENT_AI_API_KEY", baseURLKey: "DOCUMENT_AI_BASE_URL", defaultModel: "google/gemini-2.5-flash", defaultBaseURL: "https://openrouter.ai/api/v1" },
      zai: { apiKey: "DOCUMENT_AI_API_KEY", baseURLKey: "DOCUMENT_AI_BASE_URL", defaultModel: "glm-ocr", defaultBaseURL: "https://api.z.ai/api/paas/v4" },
    },
  },
  imageGen: {
    providerKey: "IMAGE_GEN_PROVIDER",
    modelKey: "IMAGE_GEN_MODEL",
    baseURLKey: "IMAGE_GEN_BASE_URL",
    providers: {
      openai: { apiKey: "IMAGE_GEN_API_KEY", defaultModel: "gpt-image-1", defaultBaseURL: "https://api.openai.com/v1" },
      gemini: { apiKey: "IMAGE_GEN_API_KEY", defaultModel: "gemini-2.5-flash-image" },
      ollama: { apiKey: "IMAGE_GEN_API_KEY", baseURLKey: "IMAGE_GEN_BASE_URL", defaultModel: "llava:latest", defaultBaseURL: "http://localhost:11434/v1" },
      openrouter: { apiKey: "IMAGE_GEN_API_KEY", baseURLKey: "IMAGE_GEN_BASE_URL", defaultModel: "google/gemini-2.5-flash-image", defaultBaseURL: "https://openrouter.ai/api/v1" },
    },
  },
} as const;

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const env = await readEnvFile();
  const customModels = await readAIModelOptions();
  const backups = await listEnvBackups();

  return NextResponse.json({
    envWritable: canWriteRuntimeEnv(),
    services: Object.entries(SERVICES).map(([key, service]) => {
      const provider = env[service.providerKey] || Object.keys(service.providers)[0];
      const providerConfig = (service.providers as Record<string, any>)[provider] ?? {};
      const apiKeyName = providerConfig.apiKey;
      const providerDefaults = (PROVIDER_DEFAULTS as Record<string, any>)[provider] ?? { models: [], baseURL: "" };
      const customProviderModels = customModels[key]?.[provider] ?? [];
      const models = Array.from(
        new Set([
          ...(providerDefaults.models ?? []),
          ...(providerConfig.defaultModel ? [providerConfig.defaultModel] : []),
          ...customProviderModels,
          env[providerConfig.modelKey ?? service.modelKey] ?? "",
        ].filter(Boolean))
      );
      const defaultModel = providerConfig.defaultModel ?? models[0] ?? "";
      const defaultBaseURL = providerConfig.defaultBaseURL ?? providerDefaults.baseURL ?? "";
      return {
        key,
        provider,
        providerKey: service.providerKey,
        providers: Object.keys(service.providers),
        model: env[providerConfig.modelKey ?? service.modelKey] ?? defaultModel,
        baseURL: env[providerConfig.baseURLKey ?? service.baseURLKey] ?? defaultBaseURL,
        providerDefaults: Object.fromEntries(
          Object.entries(service.providers).map(([providerKey, config]: [string, any]) => {
            const defaults = (PROVIDER_DEFAULTS as Record<string, any>)[providerKey] ?? {};
            const optionModels = Array.from(
              new Set([
                ...(defaults.models ?? []),
                ...(config.defaultModel ? [config.defaultModel] : []),
                ...(customModels[key]?.[providerKey] ?? []),
              ].filter(Boolean))
            );
            return [
              providerKey,
              {
                model: config.defaultModel ?? optionModels[0] ?? "",
                baseURL: config.defaultBaseURL ?? defaults.baseURL ?? "",
                models: optionModels,
              },
            ];
          })
        ),
        models,
        apiKeyName: apiKeyName ?? null,
        apiKeySet: apiKeyName ? Boolean(env[apiKeyName]) : true,
      };
    }),
    embedding: {
      provider: "gemini",
      model: env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
      apiKeySet: Boolean(env.GOOGLE_AI_API_KEY || env.GOOGLE_API_KEY),
      locked: true,
    },
    backups,
  });
}

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const serviceKey = String(body.service ?? "");
  const service = (SERVICES as Record<string, any>)[serviceKey];
  if (!service) {
    return NextResponse.json({ error: "Unknown service." }, { status: 400 });
  }

  const provider = String(body.provider ?? "");
  const providerConfig = service.providers[provider];
  if (!providerConfig) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  const updates: Record<string, string> = {
    [service.providerKey]: provider,
  };

  const providerDefaults = (PROVIDER_DEFAULTS as Record<string, any>)[provider] ?? {};
  const model = String(body.model ?? providerConfig.defaultModel ?? providerDefaults.models?.[0] ?? "").trim();
  updates[providerConfig.modelKey ?? service.modelKey] = model;

  const baseURL = String(body.baseURL ?? providerConfig.defaultBaseURL ?? providerDefaults.baseURL ?? "").trim();
  updates[providerConfig.baseURLKey ?? service.baseURLKey] = baseURL;

  const apiKey = String(body.apiKey ?? "").trim();
  if (apiKey && providerConfig.apiKey) updates[providerConfig.apiKey] = apiKey;
  if (!apiKey && serviceKey === "documentAI" && provider === "gemini" && providerConfig.apiKey) {
    const env = await readEnvFile();
    const googleKey = env.GOOGLE_AI_API_KEY || env.GOOGLE_API_KEY;
    if (googleKey) updates[providerConfig.apiKey] = googleKey;
  }
  if (model) await addAIModelOption(serviceKey, provider, model);

  const backupPath = await updateEnvFile(updates);
  return NextResponse.json({ ok: true, backupPath });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const backupName = String(body.backupName ?? "");
  await restoreEnvBackup(backupName);
  return NextResponse.json({ ok: true });
}
