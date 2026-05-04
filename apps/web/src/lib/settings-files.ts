import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export type TradeImportSource = {
  tradeId: string;
  folderPath: string;
  enabled: boolean;
  updatedAt: string;
};

export type EnvMap = Record<string, string>;
export type AIModelOptions = Record<string, Record<string, string[]>>;

const repoRoot = findRepoRoot(process.cwd());
const importSourcesPath = path.join(repoRoot, ".ams-import-sources.json");
const aiModelsPath = path.join(repoRoot, ".ams-ai-models.json");
const envPath = path.join(repoRoot, ".env");
const envBackupDir = path.join(repoRoot, ".env.backups");

export function getRepoRoot() {
  return repoRoot;
}

export function getEnvPath() {
  return envPath;
}

export function canWriteRuntimeEnv() {
  return process.env.NODE_ENV !== "production" || process.env.AMS_ALLOW_RUNTIME_ENV_WRITE === "true";
}

export function assertRuntimeEnvWriteAllowed() {
  if (!canWriteRuntimeEnv()) {
    throw new Error(
      "Runtime .env editing is disabled in production. Update Railway environment variables and redeploy/restart the affected service."
    );
  }
}

export function normalizeImportFolderPath(input: string): string {
  const trimmed = input.trim();
  const fileUrlPrefix = "file://";
  const pathValue = trimmed.startsWith(fileUrlPrefix)
    ? trimmed.slice(fileUrlPrefix.length)
    : trimmed;

  const windowsDriveMatch = pathValue.match(/^([A-Za-z]):[\\/](.*)$/);
  if (windowsDriveMatch) {
    const [, drive, rest] = windowsDriveMatch;
    return `/mnt/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
  }

  const wslShareMatch = pathValue.match(/^\\\\wsl\.localhost\\Ubuntu(\\.*)$/i);
  if (wslShareMatch) {
    return wslShareMatch[1].replace(/\\/g, "/") || "/";
  }

  return pathValue.replace(/\\/g, "/");
}

export async function readImportSources(): Promise<TradeImportSource[]> {
  try {
    const raw = await fs.readFile(importSourcesPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sources) ? parsed.sources : [];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeImportSources(sources: TradeImportSource[]) {
  await fs.writeFile(
    importSourcesPath,
    JSON.stringify({ sources }, null, 2) + "\n",
    "utf8"
  );
}

export async function readAIModelOptions(): Promise<AIModelOptions> {
  try {
    const raw = await fs.readFile(aiModelsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.services && typeof parsed.services === "object" ? parsed.services : {};
  } catch (error: any) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeAIModelOptions(services: AIModelOptions) {
  assertRuntimeEnvWriteAllowed();
  await fs.writeFile(aiModelsPath, JSON.stringify({ services }, null, 2) + "\n", "utf8");
}

export async function addAIModelOption(service: string, provider: string, model: string) {
  const trimmed = model.trim();
  if (!service || !provider || !trimmed) return;

  const services = await readAIModelOptions();
  const providerModels = services[service]?.[provider] ?? [];
  if (!providerModels.includes(trimmed)) {
    services[service] = {
      ...(services[service] ?? {}),
      [provider]: [...providerModels, trimmed].sort((a, b) => a.localeCompare(b)),
    };
    await writeAIModelOptions(services);
  }
}

export async function readEnvFile(): Promise<EnvMap> {
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const env: EnvMap = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      env[key] = parseEnvValue(rawValue);
    }
    return env;
  } catch (error: any) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export async function backupEnvFile(): Promise<string | null> {
  assertRuntimeEnvWriteAllowed();
  try {
    await fs.mkdir(envBackupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(envBackupDir, `.env.${stamp}.bak`);
    await fs.copyFile(envPath, backupPath);
    return backupPath;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function listEnvBackups(): Promise<Array<{ name: string; path: string; createdAt: string }>> {
  try {
    const entries = await fs.readdir(envBackupDir, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".bak"))
        .map(async (entry) => {
          const backupPath = path.join(envBackupDir, entry.name);
          const stat = await fs.stat(backupPath);
          return {
            name: entry.name,
            path: backupPath,
            createdAt: stat.mtime.toISOString(),
          };
        })
    );
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function updateEnvFile(updates: EnvMap): Promise<string | null> {
  assertRuntimeEnvWriteAllowed();
  const backupPath = await backupEnvFile();
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  const remaining = new Map(Object.entries(updates));
  const lines = raw.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key) ?? "";
    remaining.delete(key);
    return `${key}=${quoteEnvValue(value)}`;
  });

  for (const [key, value] of remaining) {
    lines.push(`${key}=${quoteEnvValue(value)}`);
  }

  await fs.writeFile(envPath, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
  return backupPath;
}

export async function restoreEnvBackup(backupName: string) {
  assertRuntimeEnvWriteAllowed();
  if (!/^[\w.-]+\.bak$/.test(backupName)) {
    throw new Error("Invalid backup name.");
  }
  const backupPath = path.join(envBackupDir, backupName);
  await backupEnvFile();
  await fs.copyFile(backupPath, envPath);
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

function findRepoRoot(startDir: string) {
  let currentDir = path.resolve(startDir);
  while (true) {
    if (
      path.basename(currentDir) === "Ai-Method-Statement" ||
      fsSyncExists(path.join(currentDir, "pnpm-workspace.yaml"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir, "../..");
    }
    currentDir = parentDir;
  }
}

function fsSyncExists(candidate: string) {
  return fsSync.existsSync(candidate);
}

function parseEnvValue(rawValue: string) {
  const value = rawValue.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    if (end > 0) return value.slice(1, end);
  }
  return value.replace(/\s+#.*$/, "").trim();
}
