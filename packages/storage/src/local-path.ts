import fs from "node:fs";
import path from "node:path";

interface ResolveLocalStoragePathOptions {
  configuredPath?: string;
  repoRoot?: string;
  cwd?: string;
}

export function resolveLocalStoragePath(options: ResolveLocalStoragePathOptions = {}) {
  const configuredPath = parseEnvPathValue(options.configuredPath ?? "./.storage");
  if (path.isAbsolute(configuredPath)) return configuredPath;

  return path.resolve(options.repoRoot ?? findRepoRoot(options.cwd ?? process.cwd()), configuredPath);
}

function parseEnvPathValue(rawValue: string) {
  const value = rawValue.trim();
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    if (end > 0) return value.slice(1, end).trim();
  }

  return value.replace(/\s+#.*$/, "").trim();
}

function findRepoRoot(startDir: string) {
  let currentDir = path.resolve(startDir);
  while (true) {
    try {
      fs.accessSync(path.join(currentDir, "pnpm-workspace.yaml"));
      return currentDir;
    } catch {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) return startDir;
      currentDir = parentDir;
    }
  }
}
