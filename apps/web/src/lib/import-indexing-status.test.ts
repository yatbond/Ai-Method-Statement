import assert from "node:assert/strict";
import test from "node:test";

import { buildIndexingStatus } from "./import-indexing-status";

test("marks extracted passages without embeddings as indexing failed", () => {
  const status = buildIndexingStatus({
    passageCount: 12,
    embeddedCount: 0,
    modelVersion: "gemini-embedding-2",
  });

  assert.equal(status.stage, "EMBEDDINGS_MISSING");
  assert.equal(status.ready, false);
  assert.match(status.message, /OCR complete/i);
});

test("marks fully embedded passages as retrieval ready", () => {
  const status = buildIndexingStatus({
    passageCount: 12,
    embeddedCount: 12,
    modelVersion: "gemini-embedding-2",
  });

  assert.equal(status.stage, "READY");
  assert.equal(status.ready, true);
});
