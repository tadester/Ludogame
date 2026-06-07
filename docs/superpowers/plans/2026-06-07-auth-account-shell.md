# Authentication And Account Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require email/password authentication for the application, support verification and password recovery, and give each user a protected editable profile.

**Architecture:** Use `@supabase/ssr` with separate browser, server, and proxy clients. Server-side route protection validates JWTs with `getClaims()`, while server actions own sign-up, sign-in, profile updates, password recovery, and sign-out. A migration creates a narrowly protected `profiles` table and trigger; local Supabase and Mailpit provide end-to-end verification.

**Tech Stack:** Next.js App Router and Proxy, React 19, TypeScript, Supabase Auth/PostgreSQL/RLS, `@supabase/ssr`, Vitest, Testing Library, pgTAP, Playwright

---

## File Map

- `src/lib/supabase/env.ts`: validated public Supabase environment access.
- `src/lib/supabase/client.ts`: singleton browser client factory.
- `src/lib/supabase/server.ts`: request-scoped cookie server client.
- `src/lib/supabase/proxy.ts`: session refresh and protected-route redirects.
- `src/proxy.ts`: Next.js proxy entry point and matcher.
- `src/lib/auth/validation.ts`: framework-independent auth form validation.
- `src/lib/auth/redirect.ts`: safe same-origin `next` path handling.
- `src/app/(auth)/*`: public sign-in, sign-up, verification, and recovery pages.
- `src/app/auth/*/route.ts`: confirmation and sign-out handlers.
- `src/app/(protected)/layout.tsx`: authenticated application shell.
- `src/app/(protected)/profile/*`: profile display and update action.
- `src/components/auth-form.tsx`: reusable accessible auth form presentation.
- `src/components/account-nav.tsx`: protected primary navigation.
- `supabase/migrations/*_create_profiles.sql`: profiles schema, grants, RLS, and trigger.
- `supabase/tests/profiles.test.sql`: pgTAP schema and policy coverage.
- `e2e/auth.spec.ts`: local sign-up, confirmation, sign-in, profile, sign-out, and reset flow.

### Task 1: Create The Auth Branch And Install Supabase Runtime Packages

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Create an isolated auth worktree**

Run:

```bash
git worktree add .worktrees/auth-account-shell -b tade/auth-account-shell main
```

Expected: the new worktree is on `tade/auth-account-shell`.

- [ ] **Step 2: Install current Supabase runtime packages**

Run:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Expected: both packages appear under `dependencies`; no deprecated
`@supabase/auth-helpers-nextjs` package is installed.

- [ ] **Step 3: Verify dependency compatibility**

Run:

```bash
npm run typecheck
npm test
```

Expected: existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Supabase auth runtime"
```

### Task 2: Add Supabase Client And Proxy Infrastructure

**Files:**
- Create: `src/lib/supabase/env.test.ts`
- Create: `src/lib/supabase/env.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`

- [ ] **Step 1: Write failing environment tests**

Create `src/lib/supabase/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { readSupabaseEnv } from "@/lib/supabase/env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readSupabaseEnv", () => {
  it("returns configured public credentials", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    expect(readSupabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
    });
  });

  it("throws a useful error when configuration is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => readSupabaseEnv()).toThrow(
      "Supabase environment variables are not configured",
    );
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npm test -- src/lib/supabase/env.test.ts
```

Expected: FAIL because `env.ts` does not exist.

- [ ] **Step 3: Implement validated environment access**

Create `src/lib/supabase/env.ts`:

```ts
export function readSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return { url, publishableKey };
}
```

- [ ] **Step 4: Create browser and server clients**

Create `src/lib/supabase/client.ts` with `createBrowserClient` and the validated
public environment values.

Create `src/lib/supabase/server.ts` with an async `createClient()` that:

- awaits `cookies()` from `next/headers`
- creates a fresh `createServerClient` per request
- implements `getAll()`
- implements `setAll(cookiesToSet)` inside `try/catch` for Server Components

- [ ] **Step 5: Create the session-refresh proxy**

Create `src/lib/supabase/proxy.ts` following current official guidance:

- construct a fresh server client for every request
- synchronize request and response cookies through `getAll`/`setAll`
- copy cache headers supplied by `@supabase/ssr`
- call `supabase.auth.getClaims()` immediately after client creation
- allow public paths `/login`, `/signup`, `/forgot-password`, `/auth/*`
- redirect anonymous users to `/login?next=<encoded pathname>`
- redirect authenticated users away from `/login` and `/signup` to `/`

Create `src/proxy.ts` exporting `proxy(request)` and a matcher excluding Next
assets, favicon, the manifest, and static image files.

- [ ] **Step 6: Run verification**

Run:

```bash
npm test -- src/lib/supabase/env.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected: all commands pass with `.env.local` populated from local Supabase.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase src/proxy.ts
git commit -m "feat: add Supabase SSR session infrastructure"
```

### Task 3: Create The Profile Schema And RLS Policies

**Files:**
- Create: `supabase/migrations/*_create_profiles.sql`
- Create: `supabase/tests/profiles.test.sql`
- Modify: `package.json`

- [ ] **Step 1: Create the migration file through the CLI**

Run:

```bash
npx supabase migration new create_profiles
```

Expected: the CLI creates the timestamped migration path.

- [ ] **Step 2: Write failing pgTAP tests**

Create `supabase/tests/profiles.test.sql` to verify:

- `public.profiles` exists
- RLS is enabled and forced
- primary key `id` references `auth.users(id)` with delete cascade
- `username` has a case-insensitive unique index using `lower(username)`
- authenticated users have `select` and `update` grants only
- anon has no table privileges
- policies permit a user to select and update only `id = auth.uid()`
- inserting into `auth.users` creates one profile row

Use `begin`, `select plan(...)`, pgTAP assertions, and `rollback`.

- [ ] **Step 3: Run the database test to verify failure**

Run:

```bash
npm run db:start
npx supabase test db supabase/tests/profiles.test.sql --local
```

Expected: FAIL because `public.profiles` does not exist.

- [ ] **Step 4: Implement the migration**

The migration must:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length
    check (username is null or char_length(username) between 3 and 24),
  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]+$'),
  constraint profiles_display_name_length
    check (char_length(display_name) between 1 and 40)
);
```

Also:

- create a unique index on `lower(username)` where username is not null
- enable and force RLS
- revoke all from `anon`
- grant select/update to `authenticated`
- add self-select and self-update policies with both `using` and `with check`
- put the trigger function in a private schema, not `public`
- use `security definer set search_path = ''`
- derive initial `display_name` from signup metadata, then email prefix, then
  `"Player"`; metadata is initialization input only, never authorization input
- trigger after insert on `auth.users`

- [ ] **Step 5: Run database verification**

Run:

```bash
npx supabase db reset --local
npx supabase test db supabase/tests/profiles.test.sql --local
npm run db:lint
```

Expected: pgTAP passes and database lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json supabase/migrations supabase/tests
git commit -m "feat: add protected user profiles"
```

### Task 4: Add Auth Validation And Safe Redirect Logic

**Files:**
- Create: `src/lib/auth/validation.test.ts`
- Create: `src/lib/auth/validation.ts`
- Create: `src/lib/auth/redirect.test.ts`
- Create: `src/lib/auth/redirect.ts`

- [ ] **Step 1: Write failing validation tests**

Cover:

- normalized lowercase email
- invalid email rejection
- passwords shorter than eight characters rejected
- sign-up password confirmation mismatch
- display names trimmed and limited to forty characters
- usernames normalized to lowercase and restricted to `A-Z`, `a-z`, `0-9`, `_`

- [ ] **Step 2: Write failing redirect tests**

Cover:

- `/profile` accepted
- `/play?mode=classic` accepted
- absolute URLs rejected to `/`
- protocol-relative URLs rejected to `/`
- non-leading-slash input rejected to `/`

- [ ] **Step 3: Verify both suites fail**

Run:

```bash
npm test -- src/lib/auth/validation.test.ts src/lib/auth/redirect.test.ts
```

- [ ] **Step 4: Implement minimal pure helpers**

Export:

```ts
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function validateSignIn(input: FormData): ValidationResult<{
  email: string;
  password: string;
}>;

export function validateSignUp(input: FormData): ValidationResult<{
  email: string;
  password: string;
  displayName: string;
  username: string | null;
}>;

export function validatePasswordReset(input: FormData): ValidationResult<{
  email: string;
}>;

export function validateNewPassword(input: FormData): ValidationResult<{
  password: string;
}>;

export function safeNextPath(value: string | null): string;
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm test -- src/lib/auth/validation.test.ts src/lib/auth/redirect.test.ts
npm run lint
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth
git commit -m "test: define auth input contracts"
```

### Task 5: Implement Sign-Up And Sign-In

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/actions.ts`
- Create: `src/components/auth-form.tsx`
- Create: `src/components/auth-form.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing auth form tests**

Verify the reusable form:

- associates labels with email/password fields
- supports optional display name, username, and password confirmation fields
- renders a supplied error in `role="alert"`
- renders the supplied submit label

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test -- src/components/auth-form.test.tsx
```

- [ ] **Step 3: Implement server actions**

In `src/app/(auth)/actions.ts`, implement:

- `signIn(formData)` using validation then `signInWithPassword`
- `signUp(formData)` using validation then `signUp`
- pass `display_name` and optional `username` only as initial signup metadata
- set `emailRedirectTo` to `<origin>/auth/confirm`
- redirect sign-in success through `safeNextPath`
- redirect signup success to `/check-email`
- map Auth errors to stable user-facing query messages without exposing internals

Use server-created clients only. Do not accept a service-role key.

- [ ] **Step 4: Implement pages and presentation**

- `/login` has sign-in form, forgot-password link, and sign-up link
- `/signup` has display name, username, email, password, confirmation, and
  login link
- the auth layout uses the existing competitive visual language
- `/` becomes the protected signed-in home and retains the two play cards

- [ ] **Step 5: Run verification**

Run:

```bash
npm test -- src/components/auth-form.test.tsx src/app/page.test.tsx
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat: add email sign-up and sign-in"
```

### Task 6: Add Email Confirmation And Password Recovery

**Files:**
- Create: `src/app/(auth)/check-email/page.tsx`
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/update-password/page.tsx`
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/app/(auth)/recovery-actions.ts`
- Create: `src/app/(auth)/recovery-actions.test.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Enable local email confirmation**

In `supabase/config.toml`, enable email confirmations and configure:

- site URL `http://localhost:3100`
- allowed redirect URLs for confirmation and update-password
- minimum password length eight

- [ ] **Step 2: Write failing recovery helper tests**

Test URL construction and validation for:

- confirmation route strips `token_hash` and `type` before redirect
- reset request redirects to `/update-password`
- invalid confirmation returns `/login?message=invalid-confirmation`

- [ ] **Step 3: Implement confirmation route**

Read `token_hash` and `type`, call `verifyOtp`, and redirect to `/` on success.
Never leave the token in the final URL.

- [ ] **Step 4: Implement password recovery**

- forgot-password action calls `resetPasswordForEmail`
- always display a neutral success message to avoid account enumeration
- update-password page is protected by a valid recovery session
- update action validates confirmation and calls `updateUser({ password })`
- success signs the user out and redirects to `/login?message=password-updated`

- [ ] **Step 5: Run verification**

Run:

```bash
npm test -- src/app/\(auth\)/recovery-actions.test.ts
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app supabase/config.toml
git commit -m "feat: add email verification and password recovery"
```

### Task 7: Add The Protected Account Shell And Profile Editing

**Files:**
- Create: `src/app/(protected)/layout.tsx`
- Move: `src/app/page.tsx` to `src/app/(protected)/page.tsx`
- Move: `src/app/page.test.tsx` to `src/app/(protected)/page.test.tsx`
- Create: `src/app/(protected)/profile/page.tsx`
- Create: `src/app/(protected)/profile/actions.ts`
- Create: `src/components/account-nav.tsx`
- Create: `src/components/account-nav.test.tsx`
- Create: `src/app/auth/signout/route.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing account navigation tests**

Verify links for Play, Friends, Customize, and Profile, plus a sign-out form.
Friends and Customize may link to disabled placeholder pages in later sections,
but the navigation contract exists now.

- [ ] **Step 2: Implement protected layout**

The layout:

- creates a server client
- calls `getClaims()`
- redirects to `/login` without valid claims
- renders account navigation and children

- [ ] **Step 3: Implement profile page and action**

The page selects only the signed-in user's profile. The action:

- validates display name and username with the shared validation helpers
- updates `public.profiles` using the user-scoped server client
- does not accept an `id` from form data
- handles unique username conflicts with a stable message
- revalidates `/profile`

- [ ] **Step 4: Implement sign-out**

The POST route calls `getClaims()`, signs out only when authenticated,
revalidates the root layout, and redirects to `/login`.

- [ ] **Step 5: Run verification**

Run:

```bash
npm test -- src/components/account-nav.test.tsx \
  src/app/\(protected\)/page.test.tsx
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat: add protected account and profile shell"
```

### Task 8: Add Local Auth Browser Coverage

**Files:**
- Create: `e2e/auth.spec.ts`
- Create: `e2e/support/mailpit.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add Mailpit helpers**

Implement helpers that:

- clear local Mailpit messages before a test
- poll the Mailpit HTTP API for an email recipient
- extract the first confirmation or recovery URL from the message HTML

- [ ] **Step 2: Add the sign-up journey**

The browser test:

1. opens `/signup`
2. registers a unique email, display name, username, and password
3. sees the check-email page
4. opens the confirmation link from Mailpit
5. reaches the protected home
6. updates profile display name
7. signs out
8. signs back in and sees the protected home

- [ ] **Step 3: Add password recovery journey**

The browser test:

1. requests reset for the created user
2. opens the recovery link from Mailpit
3. sets a new password
4. signs in with the new password

- [ ] **Step 4: Run local integration verification**

Run:

```bash
npm run db:start
npx supabase db reset --local
npx supabase test db supabase/tests/profiles.test.sql --local
npm run test:e2e
```

Expected: schema tests and all browser journeys pass.

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: cover local authentication journeys"
```

### Task 9: Verify And Merge The Auth Section

**Files:**
- No new files.

- [ ] **Step 1: Run the auth merge gate**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx supabase test db supabase/tests --local
npm run db:lint
npm run test:e2e
```

Expected: every command passes from a clean auth worktree.

- [ ] **Step 2: Merge into main**

Run:

```bash
git checkout main
git merge --no-ff tade/auth-account-shell -m "merge: add authentication and account shell"
```

- [ ] **Step 3: Verify merged main**

Run the same merge gate from `main`.

- [ ] **Step 4: Clean up**

```bash
git worktree remove .worktrees/auth-account-shell
git branch -d tade/auth-account-shell
```

