import assert from "node:assert/strict";
import test from "node:test";

import { EMBEDDING_DIMENSIONS, REQUIRED_EMBEDDING_MODEL } from "./index";

test("requires Gemini Embedding 2 at full vector width", () => {
  assert.equal(REQUIRED_EMBEDDING_MODEL, "gemini-embedding-2");
  assert.equal(EMBEDDING_DIMENSIONS, 3072);
});
