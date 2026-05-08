import assert from "node:assert/strict";
import test from "node:test";

import { buildEmbeddingFailureMessage } from "./embedding";

test("embedding processor reports failed passage writes", () => {
  assert.equal(
    buildEmbeddingFailureMessage({
      failed: 3,
      total: 50,
      firstError: "expected 768 dimensions, not 3072",
    }),
    "Embedding job failed for 3/50 passages. First error: expected 768 dimensions, not 3072"
  );
});
