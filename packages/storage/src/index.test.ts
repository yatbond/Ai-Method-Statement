import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveLocalStoragePath } from "./local-path";

test("local storage path strips dotenv quotes and inline comments", async () => {
  const resolvedPath = resolveLocalStoragePath({
    configuredPath: '"./.storage"  # used when STORAGE_PROVIDER=local (dev)',
    repoRoot: path.resolve("repo-root"),
    cwd: path.resolve("repo-root/apps/web"),
  });

  assert.equal(resolvedPath, path.resolve("repo-root/.storage"));
});
