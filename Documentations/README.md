# Documentation Index

Updated: 2026-05-04

Use this folder as the working documentation set for AI Method Statement Studio.

## Latest Operational Docs

- `CURRENT_DEVELOPMENT_STATUS.md`
  Current implementation status, verified checks, recommended hosted settings,
  and remaining deployment tasks.

- `railway-deployment.md`
  Step-by-step Railway + Cloudflare R2 deployment guide.

- `railway-env.example`
  Copy/paste environment variable template for Railway web and worker services.

- `Api Keys.txt`
  Secret inventory/checklist. This file intentionally contains placeholders only.

- `frontend.txt`
  Original React UI prototype plus a dated implementation note showing what has
  been implemented or changed.

## Core Product Docs

- `AI_Method_Statement_Studio_PRD_v3.docx`
  Product Requirements Document. A latest-development addendum has been appended.

- `UX_Flow_Method_Statement_Studio.docx`
  UX flow specification. A latest-development addendum has been appended.

- `Prompt_Library_Method_Statement_Studio.docx`
  Prompt library. A latest-development addendum has been appended for current
  drafting, Document AI, and safety behavior.

- `Installation Guide -v1.docx`
  Local setup guide. A latest-development addendum has been appended for hosted
  deployment and current local/hosted differences.

## Current Deployment Target

The next deployment target is Railway:

- Web: `pnpm railway:web:build` / `pnpm railway:web:start`
- Worker: `pnpm railway:worker:build` / `pnpm railway:worker:start`
- Migration: `pnpm railway:migrate`
- Health check: `/api/health`
- Storage: Cloudflare R2 via S3-compatible API

## Security Note

Do not commit live `.env` files, API keys, R2 credentials, Clerk secrets, or local
storage data. Production secrets belong in Railway service variables.
