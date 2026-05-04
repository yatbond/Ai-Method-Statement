import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRepoRoot, normalizeImportFolderPath } from "@/lib/settings-files";

type FolderEntry = {
  name: string;
  path: string;
};

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedPath = searchParams.get("path");
  const roots = await getFolderRoots();
  const currentPath = requestedPath
    ? normalizeImportFolderPath(requestedPath)
    : roots[0]?.path ?? os.homedir();

  const stat = await fs.stat(currentPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return NextResponse.json(
      { error: "Folder does not exist or cannot be opened.", currentPath, roots },
      { status: 400 }
    );
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const folders: FolderEntry[] = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pdfCount = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")
  ).length;

  return NextResponse.json({
    currentPath,
    parentPath: path.dirname(currentPath) === currentPath ? null : path.dirname(currentPath),
    roots,
    folders,
    pdfCount,
  });
}

async function getFolderRoots(): Promise<FolderEntry[]> {
  const candidates: FolderEntry[] = [
    { name: "Home", path: os.homedir() },
    { name: "Project", path: getRepoRoot() },
    { name: "Windows C", path: "/mnt/c" },
    { name: "Windows G", path: "/mnt/g" },
  ];

  const available: FolderEntry[] = [];
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate.path).catch(() => null);
    if (stat?.isDirectory()) available.push(candidate);
  }
  return available;
}
