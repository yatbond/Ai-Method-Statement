# Current Development Status

Updated: 2026-05-04

This document summarizes the current state of AI Method Statement Studio after
the latest local development and hosted-deployment preparation work.

## Status Summary

The codebase is ready for a first hosted deployment trial on Railway with:

- `ams-web`: Next.js web app
- `ams-worker`: BullMQ worker process
- Railway Postgres
- Railway Redis
- Cloudflare R2 object storage
- Clerk authentication
- Z.ai GLM-OCR as the recommended hosted Document AI OCR provider
- Gemini `text-embedding-004` as the required embedding model

The actual Railway/Cloudflare/Clerk deployment has not yet been performed from
this workspace because it requires account-level setup and production secrets.

## Verified Locally

The following checks were run successfully:

- `pnpm typecheck`
- `pnpm railway:web:build`
- `pnpm railway:worker:build`
- `pnpm railway:migrate`
- `pnpm railway:worker:start` smoke test
- Production `next start` smoke test on port `3100`
- `/login` production route smoke test
- `/api/health` runtime behavior check

`/api/health` returns `503` locally when the app is configured for local storage.
That is expected. Hosted Railway should use `STORAGE_PROVIDER=s3`, and then the
health check should return `200` once database, Redis, and environment checks
pass.

## Major Changes Implemented

### Hosted Deployment

- Added Railway build/start scripts for web and worker.
- Added Cloudflare R2-compatible storage configuration.
- Added `/api/health` for Railway health checks.
- Added shared environment validation used by the web health endpoint and worker
  startup.
- Disabled runtime `.env` editing in production unless explicitly overridden.
- Added deployment docs and Railway environment template.

### Import And Ingestion

- Added hosted-safe browser PDF upload in Settings -> Import.
- Kept local folder import for local development only.
- Added ingestion status/progress views, batch filtering, and run controls.
- Added terminate controls for individual jobs and active/queued ingestion.
- Added configurable Document AI request concurrency and request delay.
- Added cascading retry behavior for failed OCR batches by reducing batch/page
  size across retry attempts.
- Added source fingerprint/hash skip logic so already pending/running/complete
  uploaded files are skipped when reimported.

### Document AI OCR

- Added Z.ai GLM-OCR provider support.
- Added PDF splitting for providers with page/size limits.
- Added rate-limit cooldown behavior for Z.ai quota/rate-limit responses.
- Added provider/model/base URL settings for Document AI.

Important Z.ai limit currently reflected in the implementation:

- PDF request <= 50 MB
- Maximum 100 pages per request
- Large PDFs are split into smaller PDF batches where possible
- If one single PDF page exceeds the provider limit, the source file still needs
  external compression or manual split/rasterization

### Drafting

- Draft Editor now allows section-level user input.
- Section drafting uses user input, uploaded project documents, selected
  precedent passages, gap items, and conflicts.
- Empty LLM responses are handled with clearer user-facing error messages.
- Drafting keeps `[GAP:]` markers when source evidence is missing, preserving the
  no-silent-assumption principle.

### Frontend Redesign

- Main navigation now follows the prototype workflow:
  Dashboard, Projects, Trades, Draft Editor, Conflict Review, Export Review,
  Settings.
- Conflict Review is separated from the editing flow.
- Trades/Knowledge Base document views now paginate passages.
- Settings has dedicated panels for Import, AI Services, Document AI Settings,
  File Storage testing, and environment status.

### Worker And Type Safety

- Worker startup now fails clearly if required hosted environment variables are
  missing or invalid.
- Fixed worker schema drift in gap analysis, conflict detection, and export.
- Repo-wide TypeScript typecheck is green.

## Current Recommended Hosted Settings

```bash
STORAGE_PROVIDER=s3
AWS_REGION=auto
S3_FORCE_PATH_STYLE=false

GEMINI_EMBEDDING_MODEL=text-embedding-004

LLM_PROVIDER=ollama
OLLAMA_MODEL=kimi-k2.6:cloud
OLLAMA_BASE_URL=https://ollama.com/v1

DOCUMENT_AI_PROVIDER=zai
DOCUMENT_AI_MODEL=glm-ocr
DOCUMENT_AI_BASE_URL=https://api.z.ai/api/paas/v4

INGESTION_CONCURRENCY=2
DOCUMENT_AI_BATCH_PAGES=10
DOCUMENT_AI_REQUEST_DELAY_MS=120000
ZAI_OCR_RATE_LIMIT_COOLDOWN_MS=900000
HISTORICAL_MS_INGEST_ATTEMPTS=3
HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS=600
AMS_ALLOW_RUNTIME_ENV_WRITE=false
```

## Remaining External Deployment Work

1. Create Cloudflare R2 bucket and API token.
2. Create Railway project.
3. Add Railway Postgres and Redis.
4. Add GitHub-backed `ams-web` service.
5. Add GitHub-backed `ams-worker` service.
6. Add environment variables from `railway-env.example`.
7. Run `pnpm railway:migrate` once after the first deploy.
8. Open `/api/health` on the Railway web URL.
9. Test Settings -> File Storage -> Test Storage.
10. Upload one PDF via Settings -> Import and confirm the worker ingests it.

## Known Follow-Up Items

- Add a direct-to-R2 signed upload path for very large browser uploads.
- Add an admin-only database-backed secrets/settings store if runtime provider
  editing is required in hosted production.
- Add a richer ingestion quality dashboard showing page coverage, passage
  density, table detection, and suspiciously empty pages.
- Add automated OCR retry policy controls to the UI beyond the current env-based
  defaults.
