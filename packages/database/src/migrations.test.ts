import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("Gemini Embedding 2 migration widens pgvector storage to 3072 dimensions", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../prisma/migrations/005_gemini_embedding_2_vector_width/migration.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /DROP INDEX IF EXISTS source_passage_embedding_idx/i);
  assert.match(sql, /ALTER COLUMN "embedding" TYPE vector\(3072\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS source_passage_embedding_idx/i);
});
