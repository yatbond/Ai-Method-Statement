# Clerk Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth.js v5 + Azure AD SSO with Clerk (email + password) so the app works in local dev without Azure credentials. Preserve the DB user shape — all 33 API routes and 13 server pages continue working without logic changes.

**Architecture:** Clerk middleware guards all non-public routes. `getAuthUser()` calls `auth()` from `@clerk/nextjs/server` to get the Clerk user ID, looks up the PostgreSQL user record by `clerkUserId`, and returns `{ id, organisationId, email, name }`. A Clerk webhook endpoint keeps PostgreSQL in sync on `user.created` / `user.updated`.

**Tech Stack:** `@clerk/nextjs` (v5+), `svix` (webhook signature verification), Prisma (schema migration), Next.js 15 App Router.

---

## File Map

| Operation | File |
|---|---|
| Rewrite | `apps/web/src/lib/auth.ts` |
| Rewrite | `apps/web/src/middleware.ts` |
| Rewrite | `apps/web/src/app/login/page.tsx` |
| Rewrite | `apps/web/src/app/layout.tsx` |
| Rewrite | `apps/web/src/components/layout/header.tsx` |
| New | `apps/web/src/app/api/webhooks/clerk/route.ts` |
| Delete | `apps/web/src/app/api/auth/[...nextauth]/route.ts` |
| Modify | `apps/web/package.json` |
| Modify | `packages/database/prisma/schema.prisma` |
| Modify | `.env.example` |
| Mechanical | `apps/web/src/app/(app)/layout.tsx` |
| Mechanical | `apps/web/src/app/page.tsx` |
| Mechanical | `apps/web/src/app/(app)/settings/page.tsx` |
| Mechanical | 10 other `(app)/*` server pages |
| Mechanical | 33 API route files |

---

## Task 1: Update package.json

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Remove next-auth, add Clerk and svix**

Edit `apps/web/package.json`. In the `"dependencies"` block, remove the `"next-auth"` line and add two new lines:

```json
"@clerk/nextjs": "^6.0.0",
"svix": "^1.0.0",
```

Final `"dependencies"` section (excerpt showing the change):

```json
{
  "dependencies": {
    "@ams/database": "workspace:*",
    "@ams/shared": "workspace:*",
    "@ams/ai-engine": "workspace:*",
    "@ams/storage": "workspace:*",
    "@clerk/nextjs": "^6.0.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "svix": "^1.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.468.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.9.0",
    "react-hook-form": "^7.54.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "mermaid": "^11.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from the monorepo root:
```bash
pnpm install
```

Expected: Resolves `@clerk/nextjs` and `svix`, removes `next-auth`. No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: swap next-auth for @clerk/nextjs + svix"
```

---

## Task 2: Prisma schema — add clerkUserId to User

**Files:**
- Modify: `packages/database/prisma/schema.prisma:127-146`

- [ ] **Step 1: Add clerkUserId field to User model**

Open `packages/database/prisma/schema.prisma`. Find the `model User` block (starts around line 127) and add `clerkUserId` as the first field after the opening brace:

```prisma
model User {
  id             String    @id @default(cuid())
  clerkUserId    String?   @unique
  email          String    @unique
  name           String
  organisationId String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  lastLoginAt    DateTime?

  organisation     Organisation      @relation(fields: [organisationId], references: [id])
  projectMembers   ProjectMember[]
  auditLogs        AuditLog[]
  comments         Comment[]
  exports          ExportRecord[]
  gapConfirmations GapItem[]         @relation("GapConfirmedBy")
  sectionVersions  SectionVersion[]
  markerActions    ReferenceMarker[] @relation("MarkerCreatedBy")

  @@index([organisationId])
}
```

`clerkUserId` is nullable (`String?`) so the migration is non-destructive against any existing rows.

- [ ] **Step 2: Regenerate the Prisma client**

```bash
pnpm db:generate
```

Expected: Prisma client regenerates with `clerkUserId` field. No errors.

- [ ] **Step 3: Run the migration**

```bash
pnpm db:migrate
```

Prisma will prompt for a migration name. Enter: `add_clerk_user_id`

Expected: Migration file created and applied. PostgreSQL `users` table gets a new nullable `clerk_user_id` column with a unique index.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add clerkUserId to User model"
```

---

## Task 3: Rewrite lib/auth.ts

**Files:**
- Rewrite: `apps/web/src/lib/auth.ts`

- [ ] **Step 1: Write the new auth.ts**

Replace the entire contents of `apps/web/src/lib/auth.ts` with:

```ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@ams/database";

export type AuthUser = {
  id: string;
  organisationId: string;
  email: string;
  name: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: { id: true, organisationId: true, email: true, name: true },
  });

  return user;
}
```

`auth()` from `@clerk/nextjs/server` is lightweight (reads the session cookie, no network call). The subsequent DB lookup gets the app-level `id` and `organisationId` that all API routes and pages need.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web typecheck
```

Expected: No errors in `lib/auth.ts` (other files will error because they still import the old `auth` export — that's fine for now, we fix them in later tasks).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth.ts
git commit -m "feat: replace NextAuth config with getAuthUser() Clerk helper"
```

---

## Task 4: Rewrite middleware.ts

**Files:**
- Rewrite: `apps/web/src/middleware.ts`

- [ ] **Step 1: Write the new middleware**

Replace the entire contents of `apps/web/src/middleware.ts` with:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/(api|trpc)(.*)",
  ],
};
```

`auth.protect()` redirects unauthenticated users to the Clerk sign-in URL. The sign-in URL is controlled by `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login` (added in Task 13). `/api/webhooks/(.*)` is public so Clerk can POST to it without a session.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat: replace NextAuth middleware with Clerk clerkMiddleware"
```

---

## Task 5: Create Clerk webhook handler

**Files:**
- Create: `apps/web/src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Create the webhook handler**

Create the file `apps/web/src/app/api/webhooks/clerk/route.ts` with these contents:

```ts
import { Webhook } from "svix";
import { headers } from "next/headers";
import { db } from "@ams/database";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  // Must read as text — svix verifies the raw body string
  const payload = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: { type: string; data: Record<string, any> };
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as typeof evt;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;
    const email: string = email_addresses?.[0]?.email_address ?? "";
    const name = `${first_name ?? ""} ${last_name ?? ""}`.trim() || email;

    await db.user.upsert({
      where: { clerkUserId },
      update: { email, name, lastLoginAt: new Date() },
      create: {
        clerkUserId,
        email,
        name,
        organisationId: process.env.DEFAULT_ORGANISATION_ID ?? "default",
        lastLoginAt: new Date(),
      },
    });
  }

  return new Response("OK", { status: 200 });
}
```

Important: `req.text()` not `req.json()` — svix must verify the exact raw body bytes.

`DEFAULT_ORGANISATION_ID` must be set in `.env` to the ID of the organisation seeded in the DB (see `.env.example` Task 13 for the var name; see `pnpm db:seed` for the default value).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/webhooks/clerk/route.ts
git commit -m "feat: add Clerk webhook handler for user.created/updated DB sync"
```

---

## Task 6: Delete the NextAuth route

**Files:**
- Delete: `apps/web/src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm apps/web/src/app/api/auth/\[...nextauth\]/route.ts
rmdir apps/web/src/app/api/auth/\[...nextauth\] 2>/dev/null
rmdir apps/web/src/app/api/auth 2>/dev/null
```

Expected: File deleted. The `api/auth` directory is removed if it's now empty.

- [ ] **Step 2: Commit**

```bash
git add -A apps/web/src/app/api/auth/
git commit -m "chore: remove NextAuth [...nextauth] route"
```

---

## Task 7: Add ClerkProvider to root layout

**Files:**
- Rewrite: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Wrap root layout with ClerkProvider**

Replace the entire contents of `apps/web/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AI Method Statement Studio",
    template: "%s | AI Method Statement Studio",
  },
  description:
    "Construction-specific document production system for technically detailed, project-specific method statements.",
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

`ClerkProvider` must wrap the entire app (including `<html>`) for Clerk hooks and components to work in client components.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add ClerkProvider to root layout"
```

---

## Task 8: Rewrite login page

**Files:**
- Rewrite: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Replace the Microsoft SSO form with Clerk SignIn**

Replace the entire contents of `apps/web/src/app/login/page.tsx` with:

```tsx
import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const { userId } = await auth();
  if (userId) redirect("/projects");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-brand-600 mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">
            AI Method Statement Studio
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Construction document production system
          </p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}
```

`routing="hash"` works with a plain page route (no catch-all needed). Post-sign-in redirect is controlled by `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/projects` in `.env` (added in Task 13).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat: replace Microsoft SSO login with Clerk SignIn component"
```

---

## Task 9: Rewrite Header component

**Files:**
- Rewrite: `apps/web/src/components/layout/header.tsx`

- [ ] **Step 1: Replace signOut button with Clerk UserButton**

Replace the entire contents of `apps/web/src/components/layout/header.tsx` with:

```tsx
"use client";

import { UserButton } from "@clerk/nextjs";
import type { AuthUser } from "@/lib/auth";

export default function Header({ user }: { user: AuthUser }) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{user.name}</span>
        <UserButton afterSignOutUrl="/login" />
      </div>
    </header>
  );
}
```

`<UserButton />` renders the Clerk avatar with a built-in dropdown for sign out. `afterSignOutUrl` redirects to `/login` after sign-out. The prop type changes from `Session["user"]` to `AuthUser` — the interface is identical for what the Header needs (`name`).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/header.tsx
git commit -m "feat: replace next-auth signOut button with Clerk UserButton"
```

---

## Task 10: Update app layout and root redirect page

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Update `(app)/layout.tsx`**

Replace the entire contents of `apps/web/src/app/(app)/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/page.tsx`**

Replace the entire contents of `apps/web/src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  redirect("/projects");
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/layout.tsx apps/web/src/app/page.tsx
git commit -m "feat: update app layout and root page to use getAuthUser()"
```

---

## Task 11: Update server component pages (12 files — mechanical + one manual edit)

**Files:**
All files under `apps/web/src/app/(app)/` that import `auth` from `@/lib/auth`.

The 12 files:
- `apps/web/src/app/(app)/projects/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/documents/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/documents/[docId]/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/method-statements/[msId]/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/method-statements/new/page.tsx`
- `apps/web/src/app/(app)/knowledge-base/page.tsx`
- `apps/web/src/app/(app)/knowledge-base/[msId]/page.tsx`
- `apps/web/src/app/(app)/knowledge-base/upload/page.tsx`
- `apps/web/src/app/(app)/knowledge-base/vocabulary/page.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/trade-packs/page.tsx`

- [ ] **Step 1: Run bulk replacements on all 12 pages**

```bash
cd /home/yatbond/projects/Ai-Method-Statement

# All files in (app)/* that still import { auth }
FILES=$(grep -rl 'import { auth } from "@/lib/auth"' apps/web/src/app/\(app\) --include="*.tsx")

for f in $FILES; do
  perl -i -pe '
    s{import \{ auth \} from "\@/lib/auth"}{import { getAuthUser } from "\@/lib/auth"};
    s{const session = await auth\(\)}{const user = await getAuthUser()};
    s{await auth\(\);}{// auth guard handled by Clerk middleware and layout};
    s{if \(!session\) redirect\("/login"\)}{if (!user) redirect("/login")};
    s{\(session\?\.user as any\)\?\.id as string}{user!.id};
    s{\(session\.user as any\)\?\.id as string}{user!.id};
    s{\(session\?\.user as any\)\?\.organisationId as string}{user!.organisationId};
    s{\(session\.user as any\)\?\.organisationId as string}{user!.organisationId};
    s{const user = session\.user as any;}{};
  ' "$f"
done

echo "Done: $(echo "$FILES" | wc -l) files updated"
```

Expected output: `Done: 12 files updated`

- [ ] **Step 2: Manually update settings/page.tsx**

The settings page also accesses `user.email` and shows "Azure AD (SSO)" as the auth method. Open `apps/web/src/app/(app)/settings/page.tsx` and make these two targeted edits:

**Edit 1:** In the `configs` array near line 41, remove the stale NextAuth/Azure entries and add Clerk ones. Replace:

```ts
const configs: { label: string; key: string; required: boolean; purpose: string }[] = [
    { label: "ANTHROPIC_API_KEY", key: "ANTHROPIC_API_KEY", required: true, purpose: "LLM drafting & AI analysis" },
    { label: "GOOGLE_API_KEY", key: "GOOGLE_API_KEY", required: true, purpose: "Gemini embeddings & Document AI" },
    { label: "DATABASE_URL", key: "DATABASE_URL", required: true, purpose: "PostgreSQL connection" },
    { label: "REDIS_URL", key: "REDIS_URL", required: true, purpose: "BullMQ job queue" },
    { label: "STORAGE_BUCKET", key: "STORAGE_BUCKET", required: false, purpose: "S3-compatible file storage" },
    { label: "STORAGE_ENDPOINT", key: "STORAGE_ENDPOINT", required: false, purpose: "Storage endpoint (MinIO/S3)" },
    { label: "NEXTAUTH_URL", key: "NEXTAUTH_URL", required: false, purpose: "NextAuth callback base URL" },
    { label: "AZURE_AD_CLIENT_ID", key: "AZURE_AD_CLIENT_ID", required: false, purpose: "Azure AD SSO client ID" },
  ];
```

With:

```ts
const configs: { label: string; key: string; required: boolean; purpose: string }[] = [
    { label: "ANTHROPIC_API_KEY", key: "ANTHROPIC_API_KEY", required: true, purpose: "LLM drafting & AI analysis" },
    { label: "GOOGLE_API_KEY", key: "GOOGLE_API_KEY", required: true, purpose: "Gemini embeddings & Document AI" },
    { label: "DATABASE_URL", key: "DATABASE_URL", required: true, purpose: "PostgreSQL connection" },
    { label: "REDIS_URL", key: "REDIS_URL", required: true, purpose: "BullMQ job queue" },
    { label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", required: true, purpose: "Clerk authentication (public)" },
    { label: "CLERK_SECRET_KEY", key: "CLERK_SECRET_KEY", required: true, purpose: "Clerk authentication (server)" },
    { label: "STORAGE_BUCKET", key: "STORAGE_BUCKET", required: false, purpose: "S3-compatible file storage" },
    { label: "STORAGE_ENDPOINT", key: "STORAGE_ENDPOINT", required: false, purpose: "Storage endpoint (MinIO/S3)" },
  ];
```

**Edit 2:** In the JSX around line 72, change `"Azure AD (SSO)"` to `"Clerk (email + password)"`:

```tsx
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Authentication</span>
            <span className="text-sm text-gray-900">Clerk (email + password)</span>
          </div>
```

- [ ] **Step 3: Verify the 12 files have no `auth` import remaining**

```bash
grep -rn 'import { auth } from "@/lib/auth"' apps/web/src/app/\(app\) --include="*.tsx"
```

Expected: No output (zero matches).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/
git commit -m "feat: update server pages to use getAuthUser()"
```

---

## Task 12: Update API routes (33 files — mechanical)

**Files:**
All `route.ts` files under `apps/web/src/app/api/` except the just-deleted `auth/[...nextauth]/route.ts` and the new `webhooks/clerk/route.ts`.

The 33 routes:
- `api/projects/route.ts`
- `api/vocabulary/route.ts`
- `api/knowledge-base/route.ts`
- `api/vocabulary/[termId]/route.ts`
- `api/passages/[passageId]/route.ts`
- `api/knowledge-base/[msId]/route.ts`
- `api/projects/[id]/members/route.ts`
- `api/projects/[id]/method-statements/route.ts`
- `api/projects/[id]/documents/route.ts`
- `api/sections/[sectionId]/visuals/route.ts`
- `api/sections/[sectionId]/versions/route.ts`
- `api/sections/[sectionId]/comments/route.ts`
- `api/method-statements/[msId]/approve/route.ts`
- `api/method-statements/[msId]/review/route.ts`
- `api/method-statements/[msId]/quality-check/route.ts`
- `api/method-statements/[msId]/gap-analysis/route.ts`
- `api/method-statements/[msId]/retrieve/route.ts`
- `api/method-statements/[msId]/conflicts/[conflictId]/route.ts`
- `api/projects/[id]/members/[memberId]/route.ts`
- `api/sections/[sectionId]/visuals/[visualId]/route.ts`
- `api/sections/[sectionId]/versions/[versionId]/route.ts`
- `api/sections/[sectionId]/comments/[commentId]/route.ts`
- `api/method-statements/[msId]/brief/route.ts`
- `api/method-statements/[msId]/references/route.ts`
- `api/method-statements/[msId]/events/route.ts`
- `api/method-statements/[msId]/conflict-detection/route.ts`
- `api/method-statements/[msId]/withdraw/route.ts`
- `api/method-statements/[msId]/export/route.ts`
- `api/projects/[id]/documents/[docId]/passages/route.ts`
- `api/method-statements/[msId]/sections/[sectionKey]/route.ts`
- `api/method-statements/[msId]/gap-items/[gapId]/route.ts`
- `api/method-statements/[msId]/export/[exportId]/route.ts`
- `api/method-statements/[msId]/sections/[sectionKey]/specificity/route.ts`

- [ ] **Step 1: Run bulk replacements on all 33 API routes**

```bash
cd /home/yatbond/projects/Ai-Method-Statement

# All API routes except the webhook (already uses getAuthUser shape) and deleted nextauth route
FILES=$(grep -rl 'import { auth } from "@/lib/auth"' apps/web/src/app/api --include="*.ts")

for f in $FILES; do
  perl -i -pe '
    s{import \{ auth \} from "\@/lib/auth"}{import { getAuthUser } from "\@/lib/auth"};
    s{const session = await auth\(\)}{const user = await getAuthUser()};
    s{if \(!session\)}{if (!user)};
    s{\(session\.user as any\)\?\.id as string}{user.id}g;
    s{\(session\.user as any\)\?\.organisationId as string}{user.organisationId}g;
    s{\(session\?\.user as any\)\?\.id as string}{user.id}g;
    s{\(session\?\.user as any\)\?\.organisationId as string}{user.organisationId}g;
  ' "$f"
done

echo "Done: $(echo "$FILES" | wc -l) files updated"
```

Expected output: `Done: 33 files updated`

- [ ] **Step 2: Verify no session references remain**

```bash
grep -rn 'session' apps/web/src/app/api --include="*.ts" | grep -v 'webhooks/clerk'
```

Expected: No output. If any matches appear, open the file and apply the pattern manually.

- [ ] **Step 3: Verify no old auth import remains**

```bash
grep -rn 'import { auth } from "@/lib/auth"' apps/web/src/app/api --include="*.ts"
```

Expected: No output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/
git commit -m "feat: migrate all API routes from NextAuth session to getAuthUser()"
```

---

## Task 13: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the Authentication section**

In `.env.example`, replace the entire `── Authentication` section:

```bash
# ── Authentication (NextAuth.js / SSO) ────────────────────────────────────────
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"

# Azure AD SSO (production)
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID=""
```

With:

```bash
# ── Authentication (Clerk) ────────────────────────────────────────────────────
# Get these from https://clerk.com → Your App → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""

# Get from Clerk Dashboard → Webhooks → your endpoint → Signing Secret
CLERK_WEBHOOK_SECRET=""

# Clerk redirect URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/projects
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/projects

# Default org for newly created users (must match a seeded Organisation.id)
DEFAULT_ORGANISATION_ID="default"
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example for Clerk auth (remove NextAuth/Azure vars)"
```

---

## Task 14: TypeScript verification

- [ ] **Step 1: Run typecheck across the whole web package**

```bash
pnpm --filter web typecheck
```

Expected: Zero errors.

If errors appear, common causes:
- A page still has `const session = await auth()` — run grep to find it:
  ```bash
  grep -rn 'await auth()' apps/web/src --include="*.ts" --include="*.tsx" | grep -v 'getAuthUser\|clerk'
  ```
- A file still imports `Session` from `next-auth` — search and remove those imports
- `user` typed as `AuthUser | null` where `AuthUser` is expected — add `!` assertion or an early return

- [ ] **Step 2: Fix any remaining type errors**

For any file still using `session`:
```bash
# Find and list them
grep -rn '(session' apps/web/src --include="*.ts" --include="*.tsx"
```

Apply the pattern manually:
- `const session = await auth()` → `const user = await getAuthUser()`
- `if (!session)` → `if (!user)`
- `(session.user as any)?.id as string` → `user.id`
- `(session.user as any)?.organisationId as string` → `user.organisationId`
- `(session?.user as any)?.id as string` → `user!.id`
- `(session?.user as any)?.organisationId as string` → `user!.organisationId`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining TypeScript errors after Clerk migration"
```

---

## Clerk Dashboard Setup (manual, one-time — done after the above tasks)

These steps are done in a browser, not code, but are required before the app will work:

1. Sign up at https://clerk.com
2. Create an application named "AI Method Statement Studio"
3. In **User & Authentication → Email, Phone, Username**: enable **Email address** + **Password** only. Disable Google, GitHub, etc.
4. Copy **Publishable Key** and **Secret Key** into your `.env` file
5. In **Webhooks**: add a new endpoint
   - URL: `http://localhost:3000/api/webhooks/clerk` (use ngrok if needed for Clerk to reach localhost)
   - Events: check `user.created` and `user.updated`
   - Copy the **Signing Secret** into `.env` as `CLERK_WEBHOOK_SECRET`
6. Set `DEFAULT_ORGANISATION_ID` in `.env` to an organisation ID that exists after `pnpm db:seed`
   - Run `pnpm db:seed` first, then check: `psql $DATABASE_URL -c "SELECT id, name FROM \"Organisation\" LIMIT 5;"`
7. Start the app: `pnpm dev`
8. Visit http://localhost:3000/login — you should see the Clerk sign-in form
9. Create a user in Clerk (Dashboard → Users → Create user), then sign in
10. Verify the user was written to PostgreSQL: `psql $DATABASE_URL -c 'SELECT id, email, "clerkUserId" FROM "User";'`
