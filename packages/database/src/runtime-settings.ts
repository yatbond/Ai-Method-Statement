import crypto from "node:crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

export const AI_RUNTIME_SETTING_KEYS = [
  "EMBEDDING_PROVIDER",
  "GEMINI_EMBEDDING_MODEL",
  "GOOGLE_AI_API_KEY",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_BASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OLLAMA_API_KEY",
  "OLLAMA_MODEL",
  "OLLAMA_BASE_URL",
  "DOCUMENT_AI_PROVIDER",
  "DOCUMENT_AI_MODEL",
  "DOCUMENT_AI_BASE_URL",
  "DOCUMENT_AI_API_KEY",
  "IMAGE_GEN_ENABLED",
  "IMAGE_GEN_PROVIDER",
  "IMAGE_GEN_MODEL",
  "IMAGE_GEN_BASE_URL",
  "IMAGE_GEN_API_KEY",
] as const;

export function isSecretRuntimeSetting(key: string) {
  return key.endsWith("_API_KEY") || key.includes("SECRET");
}

export async function getRuntimeSettings(keys: readonly string[] = AI_RUNTIME_SETTING_KEYS) {
  const { db } = await import("./index");
  const rows = await (db as any).runtimeSetting.findMany({
    where: { key: { in: [...keys] } },
  });
  return Object.fromEntries(
    rows.map((row: { key: string; value: string; isSecret: boolean }) => [
      row.key,
      row.isSecret ? decryptRuntimeSettingValue(row.value) : row.value,
    ])
  ) as Record<string, string>;
}

export async function upsertRuntimeSettings(values: Record<string, string>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== "");
  if (entries.length === 0) return;

  const { db } = await import("./index");
  await db.$transaction(
    entries.map(([key, value]) => {
      const isSecret = isSecretRuntimeSetting(key);
      const storedValue = isSecret ? encryptRuntimeSettingValue(value) : value;
      return (db as any).runtimeSetting.upsert({
        where: { key },
        create: { key, value: storedValue, isSecret },
        update: { value: storedValue, isSecret },
      });
    })
  );
}

export async function applyRuntimeSettingsToProcessEnv(keys: readonly string[] = AI_RUNTIME_SETTING_KEYS) {
  const settings = await getRuntimeSettings(keys);
  for (const [key, value] of Object.entries(settings)) {
    if (value) process.env[key] = value;
  }
  return settings;
}

export function encryptRuntimeSettingValue(value: string, keyMaterial = getRuntimeSettingsKeyMaterial()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveRuntimeSettingsKey(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptRuntimeSettingValue(value: string, keyMaterial = getRuntimeSettingsKeyMaterial()) {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  const parts = value.slice(ENCRYPTED_PREFIX.length).split(":");
  if (parts.length !== 3) return "";
  const [ivBase64, tagBase64, encryptedBase64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveRuntimeSettingsKey(keyMaterial),
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function deriveRuntimeSettingsKey(keyMaterial: string) {
  return crypto.createHash("sha256").update(keyMaterial).digest();
}

function getRuntimeSettingsKeyMaterial() {
  return (
    process.env.APP_SETTINGS_ENCRYPTION_KEY ||
    process.env.CLERK_SECRET_KEY ||
    process.env.DATABASE_URL ||
    "ai-method-statement-runtime-settings"
  );
}
