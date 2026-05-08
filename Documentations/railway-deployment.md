# Railway Deployment

Updated: 2026-05-04

This guide describes the current hosted deployment path for AI Method Statement
Studio. The intended production-style stack is:

- `ams-web`: Next.js web service
- `ams-worker`: long-running BullMQ worker service
- Railway Postgres
- Railway Redis
- Cloudflare R2 object storage
- Clerk authentication
- Gemini `gemini-embedding-2` embeddings
- Z.ai GLM-OCR Document AI OCR

Railway should be connected to the GitHub repository. Keep the repository root as
the service root for both app services, then set different build/start commands
per service.

## 1. Create Cloudflare R2 Storage

Create R2 before the Railway app so the storage env vars are ready.

1. In Cloudflare, open R2 and create a private bucket, for example
   `ai-method-statement-documents`.
2. Create an R2 API token with object read/write access for that bucket.
3. Copy the Access Key ID and Secret Access Key.
4. Copy the Cloudflare account ID.

The app can build the R2 endpoint from `CLOUDFLARE_R2_ACCOUNT_ID`, or you can set
the endpoint directly:

```bash
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
AWS_REGION=auto
S3_FORCE_PATH_STYLE=false
```

## 2. Create Railway Project

1. Create a new Railway project.
2. Add a Postgres service.
3. Add a Redis service.
4. Add a GitHub repo service for the web app.
5. Add a second GitHub repo service for the worker.

## 3. Web Service

Service name: `ams-web`

Build command:

```bash
pnpm railway:web:build
```

Start command:

```bash
pnpm railway:web:start
```

Health-check path:

```text
/api/health
```

The health endpoint verifies:

- required environment variables
- database connectivity
- Redis connectivity

It returns HTTP `503` if any required check fails.

## 4. Worker Service

Service name: `ams-worker`

Build command:

```bash
pnpm railway:worker:build
```

Start command:

```bash
pnpm railway:worker:start
```

The worker must stay online. Do not deploy it as a serverless function. The
worker validates required environment variables at startup and fails clearly if a
required provider, storage, database, Redis, or embedding setting is missing.

## 5. Database Migration

After the first deploy, run this once from a Railway shell or one-off job:

```bash
pnpm railway:migrate
```

Run it again whenever a new Prisma migration is added.

## 6. Required Environment Variables

Use `Documentations/railway-env.example` as the copy/paste template.

Set these on both `ams-web` and `ams-worker` unless noted:

```bash
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

DATABASE_URL=<Railway Postgres DATABASE_URL>
REDIS_URL=<Railway Redis REDIS_URL>

STORAGE_PROVIDER=s3
AWS_REGION=auto
AWS_S3_BUCKET=<R2 bucket name>
AWS_ACCESS_KEY_ID=<R2 access key id>
AWS_SECRET_ACCESS_KEY=<R2 secret access key>
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=false

GOOGLE_AI_API_KEY=<Google AI key>
GEMINI_EMBEDDING_MODEL=gemini-embedding-2

LLM_PROVIDER=ollama
OLLAMA_API_KEY=<Ollama Cloud key>
OLLAMA_MODEL=kimi-k2.6:cloud
OLLAMA_BASE_URL=https://ollama.com/v1

DOCUMENT_AI_PROVIDER=zai
DOCUMENT_AI_API_KEY=<Z.ai key>
DOCUMENT_AI_MODEL=glm-ocr
DOCUMENT_AI_BASE_URL=https://api.z.ai/api/paas/v4

AMS_ALLOW_RUNTIME_ENV_WRITE=false
```

Web-only:

```bash
NEXT_PUBLIC_APP_URL=https://<railway-web-domain>
APP_URL=https://<railway-web-domain>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk publishable key>
CLERK_SECRET_KEY=<Clerk secret key>
CLERK_WEBHOOK_SECRET=<Clerk webhook secret, if enabled>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
DEFAULT_ORGANISATION_ID=default
```

Recommended worker tuning:

```bash
INGESTION_CONCURRENCY=2
DOCUMENT_AI_BATCH_PAGES=10
DOCUMENT_AI_REQUEST_DELAY_MS=120000
ZAI_OCR_RATE_LIMIT_COOLDOWN_MS=900000
HISTORICAL_MS_INGEST_ATTEMPTS=3
HISTORICAL_MS_INGEST_RETRY_DELAY_SECONDS=600
```

## 7. Runtime Settings Behavior

Local development can edit `.env` through Settings.

Hosted Railway production should treat env vars as immutable deployment
configuration. Runtime `.env` editing is disabled by default when
`NODE_ENV=production`.

Keep this setting:

```bash
AMS_ALLOW_RUNTIME_ENV_WRITE=false
```

If provider/API-key editing is required in production later, move those settings
into encrypted database records rather than writing to `.env`.

## 8. Importing PDFs In The Hosted App

Settings -> Import has two import paths:

- Browser upload: select PDF files from your computer and click
  `Upload & Ingest`. This is the hosted Railway-safe path. The web service
  uploads PDFs to R2 and queues worker OCR jobs.
- Local folder import: browse or paste a server folder path. This is only for
  local development because Railway cannot read a user's Windows or WSL drive.

Uploaded files are skipped when the same file hash is already pending, running,
or complete for that trade. Failed and cancelled files can be uploaded again for
another attempt.

## 9. Document AI OCR Behavior

The recommended hosted provider is Z.ai GLM-OCR:

```bash
DOCUMENT_AI_PROVIDER=zai
DOCUMENT_AI_MODEL=glm-ocr
DOCUMENT_AI_BASE_URL=https://api.z.ai/api/paas/v4
```

The implementation accounts for Z.ai request limits by splitting PDFs into
batches:

- PDF request size <= 50 MB
- Maximum 100 pages per request
- `DOCUMENT_AI_BATCH_PAGES` controls initial batch size
- Failed batches can be retried with smaller page batches
- `DOCUMENT_AI_REQUEST_DELAY_MS` spaces out requests to reduce rate-limit errors
- `ZAI_OCR_RATE_LIMIT_COOLDOWN_MS` pauses after quota/rate-limit responses

If a single PDF page is larger than the provider limit, the app cannot split that
page smaller as a PDF. Compress, manually split, or rasterize that page outside
the app before retrying.

## 10. Smoke Test

After deployment:

1. Open the Railway web URL.
2. Open `/api/health`. It should return HTTP `200` with `database`, `redis`, and
   `environment` all `ok: true`.
3. Log in through Clerk.
4. Confirm Settings loads.
5. In Settings -> Environment configuration, confirm required settings show as
   present.
6. In Settings -> File Storage, click `Test Storage`. It should upload,
   download, verify, and delete a small object in R2.
7. In Settings -> Import, choose a trade, select one PDF, click
   `Upload & Ingest`, and confirm the worker processes `historical-ms.ingest`.
8. Create or open a method statement.
9. Add section input under Scope.
10. Draft the section and confirm the worker processes `draft.section`.

## 11. Troubleshooting

### `/api/health` returns 503

Read the JSON response. It lists the failing check. Common causes:

- `STORAGE_PROVIDER` is not `s3` in production
- R2 bucket/key/endpoint is missing
- Redis service is not attached
- Postgres service is not attached
- Clerk keys are missing on the web service

### Browser upload works locally but fails on Railway

Check R2 variables on both web and worker services. The web service writes the
uploaded PDF to R2; the worker later downloads it for OCR. Both need access.

### OCR returns Z.ai rate-limit errors

Reduce concurrency or increase delay:

```bash
INGESTION_CONCURRENCY=1
DOCUMENT_AI_REQUEST_DELAY_MS=180000
```

Then retry failed/cancelled files only.

### Local folder import does not work on Railway

That is expected. Hosted services cannot read a user's local `G:\` drive or WSL
folder. Use browser upload in hosted mode.
