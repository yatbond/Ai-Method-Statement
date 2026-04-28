# AI Method Statement Studio

## Project overview

AI Method Statement Studio is an internal web application for construction teams to produce technically detailed, project-specific, contract-aware method statements. It combines approved historical method statements, current project documents, structured user inputs, and AI assistance under a strict source-authority and human-confirmation model.

This is **not** a generic AI writing tool. It retrieves approved precedent, extracts contract requirements, identifies gaps, asks targeted questions, surfaces conflicts, and produces formatted Word documents.

## Monorepo structure

```
apps/
  web/              Next.js 14 frontend (App Router, TypeScript, Tailwind)
packages/
  database/         Prisma schema, migrations, seeding
  ai-engine/        AI provider abstractions (embedding, LLM, document AI)
  shared/           Shared TypeScript types and constants
services/
  worker/           BullMQ background workers (ingestion, embedding, gap analysis)
```

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 + React 18 + Tailwind v4 | App Router, server components |
| Auth | Clerk (`@clerk/nextjs`) | Email + password; session via clerkMiddleware; user sync via webhook |
| Database | PostgreSQL 16 + pgvector | Prisma ORM, vector extension |
| Vector store | pgvector (initial) | Abstracted; pluggable to managed service |
| File storage | S3-compatible (AWS/MinIO) | Per-project access control, versioned |
| Embedding | Google Gemini Embedding 2 (`text-embedding-004`) | **Required** — multimodal, not substitutable |
| LLM | Provider-agnostic abstraction | Anthropic Claude default; swappable via eval harness |
| Document AI | Pluggable provider | Google Document AI default |
| Workers | BullMQ + Redis | Idempotent jobs, visible status |
| Observability | OpenTelemetry | Per-request tracing, cost-per-action |

## Key product principles (from PRD §4)

- **P1 — No silent assumption**: Mark gaps, never fabricate.
- **P2 — User confirmation**: Precedent content enters draft only after explicit confirmation.
- **P3 — Source authority**: Current project docs > historical precedent > AI general knowledge.
- **P4 — Specificity over fluency**: Flag vague phrasing; push toward concrete answers.
- **P5 — Editability**: All generated content is editable; tables never flattened to images.
- **P6 — Traceability**: Every paragraph, table, and visual links to its sources.

## Source authority hierarchy

1. Current project contract documents
2. Current project specifications
3. Current project drawings
4. Current project safety / risk requirements
5. Current project programme and site constraints
6. User-confirmed answers
7. Approved historical method statements
8. Company standard clauses
9. AI general knowledge (phrasing/structure only — MUST NOT assert technical facts)

## Development phases (MVP = P0–P10)

| Phase | Deliverable | Duration |
|---|---|---|
| P0 | Foundation & infrastructure | 3 weeks |
| P1 | Document ingestion pipeline | 4 weeks |
| P2 | Knowledge base & retrieval | 4 weeks |
| P3 | Gap analysis & suggested selections | 3 weeks |
| P4 | Conflict detection & source authority | 3 weeks |
| P5 | Traceability reference system | 3 weeks |
| P6 | Drafting engine & Method Statement Brief | 4 weeks |
| P7 | Specificity engine & vocabulary control | 2 weeks |
| P8 | Table generation & Word export | 3 weeks |
| P9 | Eval harness, hallucination check, AI safety | 2 weeks |
| P10 | MVP integration, QA & hardening | 3 weeks |
| Pilot | Two trades, two projects | 8–12 weeks |
| P11 | v1.1 (visuals, vocab, EDMS, traceability panel) | 6 weeks |
| P12 | v1.2 (image gen, approval workflow, real-time) | 6 weeks |

## Environment

Copy `.env.example` to `.env` and fill in values. Run infrastructure with:

```bash
docker-compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Critical constraints

- The embedding model **MUST** be Google Gemini Embedding 2 (`text-embedding-004`). Text-only models (OpenAI, Cohere) are explicitly prohibited by REQ-RAG-002 — they cannot embed diagrams and tables into the shared retrieval index.
- AI providers **MUST** have no-training data agreements in place before use (REQ-NFR-SEC-006).
- Exported Word documents **MUST NOT** carry any AI-generated label or watermark (REQ-SIGN-001).
- Human sign-off is the only approval path; no automated final approval (REQ-SIGN-003).

## Running tests

```bash
pnpm test                   # all packages
pnpm --filter web test      # web only
pnpm --filter worker test   # worker only
```

## Database commands

```bash
pnpm db:generate            # regenerate Prisma client
pnpm db:migrate             # run pending migrations (dev)
pnpm db:studio              # open Prisma Studio
pnpm db:seed                # seed trade packs and standard data
```
