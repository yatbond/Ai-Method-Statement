# Clerk Auth Migration Design

## Summary

Replace NextAuth.js v5 + Azure AD SSO with Clerk authentication (email + password) for simpler local development. Preserve the existing user-to-PostgreSQL sync so all 31+ API routes continue to work without logic changes.

## Architecture

1. **Middleware** — Clerk `clerkMiddleware` protects all routes (same matcher as current NextAuth middleware)
2. **Login page** — Clerk `<SignIn />` pre-built component (email + password)
3. **Session in server components/API routes** — `currentUser()` from `@clerk/nextjs` replaces `auth()` from NextAuth
4. **User DB sync** — Clerk webhook fires on `user.created` and `user.updated` to upsert into PostgreSQL
5. **Header** — Clerk `<UserButton />` component (avatar + dropdown with sign out)
6. **Session shape** — `getAuthUser()` helper returns `{ id, organisationId, email, name }` from Clerk + DB lookup

## File Changes

### Delete

- `apps/web/src/app/api/auth/[...nextauth]/route.ts` — Clerk handles its own routes

### Rewrite

| File | Change |
|---|---|
| `apps/web/src/lib/auth.ts` | Replace NextAuth config with `getAuthUser()` helper: calls `currentUser()` from Clerk, looks up DB user by `clerkUserId`, returns `{ id, organisationId, email, name }` or `null` |
| `apps/web/src/middleware.ts` | Swap `auth as middleware` to Clerk `clerkMiddleware` with same route matcher |
| `apps/web/src/app/login/page.tsx` | Replace custom Microsoft form with Clerk `<SignIn />` component |
| `apps/web/src/components/layout/header.tsx` | Replace `signOut` from next-auth with Clerk `<UserButton />` |

### New

| File | Purpose |
|---|---|
| `apps/web/src/app/api/webhooks/clerk/route.ts` | Webhook handler for `user.created` / `user.updated` events — upserts user into PostgreSQL |

### Mechanical changes (~31 API routes)

Every API route changes from:
```ts
const session = await auth();
if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
const { id: userId, organisationId } = session.user as any;
```

To:
```ts
const user = await getAuthUser();
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
const { id: userId, organisationId } = user;
```

No logic changes — import and function name swap only.

### Package changes

- Remove: `next-auth`
- Add: `@clerk/nextjs`

### Environment

Remove:
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `NEXTAUTH_SECRET`

Add:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`

## Data Flow

```
User visits /login
  -> Clerk <SignIn /> component renders
  -> User enters email + password
  -> Clerk authenticates

Clerk fires webhook (user.created / user.updated)
  -> POST /api/webhooks/clerk
  -> Upsert user into PostgreSQL (clerkUserId, id, email, name, organisationId, lastLoginAt)

User visits protected route
  -> Clerk middleware checks session
  -> No session -> redirect to /login
  -> Session exists -> proceed

API route called
  -> getAuthUser() calls currentUser() (Clerk)
  -> Looks up DB user by clerkUserId -> gets id, organisationId
  -> Returns user object or null

User clicks sign out
  -> Clerk <UserButton /> handles natively
  -> Redirects to /login
```

## Prisma Schema Change

Add `clerkUserId` field to User model:

```prisma
model User {
  clerkUserId String @unique // NEW - links to Clerk
  // ... all existing fields unchanged
}
```

Requires a migration. Non-destructive — adds a column, removes nothing.

## Clerk Dashboard Setup (manual, one-time)

1. Sign up at https://clerk.com
2. Create application "AI Method Statement Studio"
3. Enable Email + Password as the only sign-in method
4. Copy Publishable Key and Secret Key to `.env`
5. Configure webhook: endpoint = `http://localhost:3000/api/webhooks/clerk`, events = `user.created`, `user.updated`
6. Copy webhook signing secret to `.env` as `CLERK_WEBHOOK_SECRET`

## Scope

- This spec covers the auth swap only
- Clerk organization mapping (if needed for multi-tenant) is out of scope — `DEFAULT_ORGANISATION_ID` env var continues to work as before
- Roles/permissions remain unchanged in the database
