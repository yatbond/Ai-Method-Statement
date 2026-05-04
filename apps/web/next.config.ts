import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const rootEnvPath = findRootEnvPath(process.cwd());
const repoRoot = path.dirname(rootEnvPath);
process.env.AMS_REPO_ROOT = repoRoot;

if (fs.existsSync(rootEnvPath)) {
  const lines = fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (key === "NODE_ENV") continue;

    const parsedValue = parseEnvValue(rawValue);
    process.env[key] =
      key === "LOCAL_STORAGE_PATH" && parsedValue && !path.isAbsolute(parsedValue)
        ? path.resolve(repoRoot, parsedValue)
        : parsedValue;
  }
}

function findRootEnvPath(startDir: string) {
  let currentDir = path.resolve(startDir);
  let fallbackEnvPath: string | null = null;

  while (true) {
    const candidate = path.join(currentDir, ".env");
    if (fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
      return candidate;
    }
    if (!fallbackEnvPath && fs.existsSync(candidate)) fallbackEnvPath = candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return fallbackEnvPath ?? path.resolve(startDir, "../..", ".env");
    }
    currentDir = parentDir;
  }
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

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
  images: {
    remotePatterns: [],
  },
  webpack(config, { dev, nextRuntime }) {
    if (!dev && nextRuntime === "edge") {
      config.devtool = false;
    }
    return config;
  },
};

export default nextConfig;
