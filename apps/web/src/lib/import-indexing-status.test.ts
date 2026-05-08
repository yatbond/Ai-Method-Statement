import assert from "node:assert/strict";
import test from "node:test";

import { buildIndexingStatus, buildReembedQueueMessage } from "./import-indexing-status";

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

test("describes queued embedding batches", () => {
  assert.equal(
    buildReembedQueueMessage({
      passageCount: 119,
      queuedBatchCount: 3,
      modelVersion: "gemini-embedding-2",
    }),
    "Queued 119 passages in 3 embedding jobs for gemini-embedding-2."
  );
});

test("describes when no passages need embedding", () => {
  assert.equal(
    buildReembedQueueMessage({
      passageCount: 0,
      queuedBatchCount: 0,
      modelVersion: "gemini-embedding-2",
    }),
    "No passages need re-embedding for gemini-embedding-2."
  );
});
