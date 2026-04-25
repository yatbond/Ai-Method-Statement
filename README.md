# AI Method Statement Studio

> A construction-specific document production system — PRD v2.0

AI Method Statement Studio helps construction teams produce technically detailed, project-specific, contract-aware method statements by combining approved historical precedent, current project documents, and AI assistance under a strict source-authority and human-confirmation model.

## What it does

- **Ingests** project documents (contracts, specs, drawings, risk assessments) and indexes historical approved method statements
- **Retrieves** relevant precedent using multimodal hybrid search (semantic + keyword + metadata)
- **Identifies gaps** across 22 categories before drafting begins
- **Detects conflicts** between current project requirements and historical precedent
- **Drafts** section-by-section using confirmed inputs with full traceability
- **Scores specificity** — flags vague phrases like "as required" or "appropriate PPE"
- **Exports** to the company Word template with editable tables, appendices, and source references

## Quick start

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Docker (for PostgreSQL, Redis, MinIO)
- Google AI API key (Gemini Embedding 2 — required)

### Setup

```bash
# Clone and install
git clone <repo>
cd ai-method-statement-studio
pnpm install

# Start infrastructure
docker-compose up -d

# Configure environment
cp .env.example .env
# Edit .env with your API keys and SSO credentials

# Run database migrations and seed
pnpm db:migrate
pnpm db:seed

# Start development servers
pnpm dev
```

The web app runs at `http://localhost:3000`.

## Project structure

```
apps/web/          Next.js frontend
packages/
  database/        Prisma schema + migrations
  ai-engine/       Embedding, LLM, Document AI abstractions
  shared/          Shared types and constants
services/worker/   Background job processors
```

## Key architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Embedding model | Google Gemini Embedding 2 | Only production multimodal model supporting joint text + image + diagram + table embedding. Required by PRD (REQ-RAG-002). |
| Vector store | pgvector → pluggable | Start with Postgres extension; abstract for managed service swap |
| Auth | NextAuth.js + SAML/OIDC | SSO to company Azure AD; no hosted email/password |
| Drafting LLM | Provider-agnostic | Anthropic Claude default; eval-harness-gated swaps |
| Tables | Structured editable data | Never flattened to images; exported as native Word tables |

## Development phases

See `CLAUDE.md` for full phase breakdown. Current target: **Phase 0 — Foundation**.

## License

Internal use only. Not for external distribution.
