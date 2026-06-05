# Foundation And CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested Next.js PWA foundation with a responsive shell, local Supabase configuration, and CI checks that later feature branches can trust.

**Architecture:** Use the Next.js App Router under `src/app`, with small UI components under `src/components` and test configuration at the repository root. Keep Supabase initialized but do not add authentication or application tables on this branch.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, ESLint, Vitest, Testing Library, Playwright, Supabase CLI, GitHub Actions

---

## File Map

- `package.json`: scripts and dependency entry point.
- `src/app/layout.tsx`: root metadata, viewport, and global shell.
- `src/app/page.tsx`: temporary public landing page.
- `src/app/manifest.ts`: installable PWA metadata.
- `src/app/globals.css`: theme tokens and responsive base styles.
- `src/components/app-shell.tsx`: reusable phone-first page frame.
- `src/components/app-shell.test.tsx`: component contract tests.
- `src/test/setup.ts`: DOM matcher setup and browser API stubs.
- `vitest.config.ts`: unit/component test configuration.
- `playwright.config.ts`: browser test configuration.
- `e2e/home.spec.ts`: landing-page and mobile-layout smoke tests.
- `public/icons/icon.svg`: temporary scalable application icon.
- `supabase/config.toml`: local Supabase project configuration.
- `.env.example`: documented public local environment variables.
- `.github/workflows/ci.yml`: lint, typecheck, unit, build, and browser checks.

### Task 1: Create The Foundation Branch And Scaffold Next.js

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `public/`

- [ ] **Step 1: Merge the approved design into main**

Run:

```bash
git checkout main
git merge --no-ff tade/ludo-platform-design -m "merge: approve ludo platform design"
```

Expected: `main` contains commit `974e448` and the merge completes without
conflicts.

- [ ] **Step 2: Create the section branch**

Run:

```bash
git checkout -b tade/foundation-ci
```

Expected: current branch is `tade/foundation-ci`.

- [ ] **Step 3: Generate a current Next.js application in a temporary directory**

Run:

```bash
npx create-next-app@latest /private/tmp/ludogame-next \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --disable-git \
  --yes
```

Expected: `/private/tmp/ludogame-next` contains a TypeScript App Router project
and its tests are not yet configured.

- [ ] **Step 4: Copy the generated application into the repository**

Run:

```bash
cp /private/tmp/ludogame-next/package.json .
cp /private/tmp/ludogame-next/package-lock.json .
cp /private/tmp/ludogame-next/next.config.ts .
cp /private/tmp/ludogame-next/next-env.d.ts .
cp /private/tmp/ludogame-next/tsconfig.json .
cp /private/tmp/ludogame-next/eslint.config.mjs .
cp /private/tmp/ludogame-next/postcss.config.mjs .
cp -R /private/tmp/ludogame-next/src .
cp -R /private/tmp/ludogame-next/public .
```

Expected: generated Next.js files appear in the repository while the existing
`.git`, `.gitignore`, `README.md`, and `docs/` remain present.

- [ ] **Step 5: Add project scripts**

Modify `package.json` so its name is `"ludogame"` and its scripts object is:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 6: Verify the generated application**

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all three commands exit successfully.

- [ ] **Step 7: Commit the scaffold**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json \
  next-env.d.ts eslint.config.mjs postcss.config.mjs src public
git commit -m "chore: scaffold Next.js application"
```

### Task 2: Add Unit And Component Test Infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/components/app-shell.test.tsx`
- Create: `src/components/app-shell.tsx`

- [ ] **Step 1: Install the test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @vitejs/plugin-react \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: dependencies are recorded in `package.json` and `package-lock.json`.

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write the failing shell test**

Create `src/components/app-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  it("renders the product name and supplied content", () => {
    render(
      <AppShell>
        <p>Choose a game</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("Ludo");
    expect(screen.getByText("Choose a game")).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
npm test -- src/components/app-shell.test.tsx
```

Expected: FAIL because `@/components/app-shell` does not exist.

- [ ] **Step 5: Implement the minimal shell**

Create `src/components/app-shell.tsx`:

```tsx
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Ludo</span>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
npm test -- src/components/app-shell.test.tsx
```

Expected: one passing test.

- [ ] **Step 7: Run static verification**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 8: Commit the test foundation**

```bash
git add package.json package-lock.json vitest.config.ts src/test \
  src/components
git commit -m "test: add component test foundation"
```

### Task 3: Build The Temporary Phone-First Landing Shell

**Files:**
- Create: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the failing landing-page test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("presents the two approved play types", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Choose how to play" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Friend room" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Pass the phone" }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/app/page.test.tsx
```

Expected: FAIL because the generated page does not expose the approved play
choices.

- [ ] **Step 3: Implement the landing page**

Replace `src/app/page.tsx` with:

```tsx
import { AppShell } from "@/components/app-shell";

const playTypes = [
  {
    name: "Friend room",
    description: "Invite friends to a private online match.",
  },
  {
    name: "Pass the phone",
    description: "Play locally with temporary player names.",
  },
] as const;

export default function Home() {
  return (
    <AppShell>
      <section className="hero">
        <p className="eyebrow">Classic and Nigerian rules</p>
        <h1>Choose how to play</h1>
        <p className="hero-copy">
          The game foundation is ready. Account and match setup arrive in the
          next sections.
        </p>
      </section>
      <section className="play-grid" aria-label="Play types">
        {playTypes.map((playType) => (
          <article className="play-card" key={playType.name}>
            <h2>{playType.name}</h2>
            <p>{playType.description}</p>
            <button type="button" disabled>
              {playType.name}
            </button>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 4: Set root metadata**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ludo",
  description: "Play Classic and Nigerian Ludo with friends.",
  applicationName: "Ludo",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Add the temporary competitive styles**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --background: #07111f;
  --panel: #102238;
  --panel-border: #31506c;
  --text: #f8fafc;
  --muted: #94a3b8;
  --accent: #d4af37;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--background);
}

body {
  min-height: 100dvh;
  margin: 0;
  background:
    radial-gradient(circle at top, #19324b 0, transparent 42%),
    var(--background);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}

button {
  font: inherit;
}

.app-shell {
  width: min(100%, 72rem);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 1rem;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 3.5rem;
}

.brand-mark {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 1.25rem color-mix(in srgb, var(--accent), transparent 35%);
}

.brand-name {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.app-content {
  padding: clamp(2rem, 10vw, 7rem) 0 3rem;
}

.hero {
  max-width: 42rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0;
  font-size: clamp(2.4rem, 12vw, 5rem);
  line-height: 0.95;
}

.hero-copy {
  max-width: 36rem;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.6;
}

.play-grid {
  display: grid;
  gap: 1rem;
  margin-top: 2.5rem;
}

.play-card {
  padding: 1.25rem;
  border: 1px solid var(--panel-border);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--panel), transparent 8%);
}

.play-card h2 {
  margin: 0;
}

.play-card p {
  min-height: 3rem;
  color: var(--muted);
  line-height: 1.5;
}

.play-card button {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid var(--panel-border);
  border-radius: 0.65rem;
  background: transparent;
  color: var(--muted);
}

@media (min-width: 42rem) {
  .app-shell {
    padding-inline: 2rem;
  }

  .play-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 6: Run the landing tests and static checks**

Run:

```bash
npm test -- src/app/page.test.tsx src/components/app-shell.test.tsx
npm run lint
npm run typecheck
```

Expected: all tests and checks pass.

- [ ] **Step 7: Commit the landing shell**

```bash
git add src/app src/components
git commit -m "feat: add phone-first application shell"
```

### Task 4: Add The PWA Manifest

**Files:**
- Create: `src/app/manifest.test.ts`
- Create: `src/app/manifest.ts`
- Create: `public/icons/icon.svg`

- [ ] **Step 1: Write the failing manifest test**

Create `src/app/manifest.test.ts`:

```ts
import manifest from "@/app/manifest";
import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("defines an installable standalone application", () => {
    expect(manifest()).toMatchObject({
      name: "Ludo",
      short_name: "Ludo",
      display: "standalone",
      start_url: "/",
      theme_color: "#07111f",
      background_color: "#07111f",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/app/manifest.test.ts
```

Expected: FAIL because `src/app/manifest.ts` does not exist.

- [ ] **Step 3: Implement the manifest**

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ludo",
    short_name: "Ludo",
    description: "Play Classic and Nigerian Ludo with friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
```

Create `public/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#07111f"/>
  <circle cx="256" cy="256" r="150" fill="#d4af37"/>
  <circle cx="256" cy="256" r="78" fill="#07111f"/>
</svg>
```

- [ ] **Step 4: Run the test and build**

Run:

```bash
npm test -- src/app/manifest.test.ts
npm run build
```

Expected: the manifest test passes and Next.js builds successfully.

- [ ] **Step 5: Commit the PWA metadata**

```bash
git add src/app/manifest.ts src/app/manifest.test.ts public/icons/icon.svg
git commit -m "feat: add installable PWA manifest"
```

### Task 5: Initialize Local Supabase Development

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/config.toml`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Install and inspect the Supabase CLI**

Run:

```bash
npm install --save-dev supabase
npx supabase --help
```

Expected: the CLI help lists local development and database commands.

- [ ] **Step 2: Initialize Supabase**

Run:

```bash
npx supabase init
```

Expected: `supabase/config.toml` is created. Do not create application tables
or authentication policies on this branch.

- [ ] **Step 3: Document environment variables**

Create `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
```

- [ ] **Step 4: Add local Supabase scripts**

Add these scripts to `package.json`:

```json
{
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:status": "supabase status",
  "db:lint": "supabase db lint"
}
```

- [ ] **Step 5: Document local setup**

Replace `README.md` with:

```md
# Ludo

Phone-first Classic and Nigerian Ludo built with Next.js and Supabase.

## Requirements

- Node.js 24
- npm
- Docker-compatible container runtime

## Setup

1. Run `npm install`.
2. Run `npm run db:start`.
3. Copy `.env.example` to `.env.local`.
4. Replace the publishable key with the value from `npm run db:status`.
5. Run `npm run dev`.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
```

- [ ] **Step 6: Verify the configuration without starting Docker**

Run:

```bash
npx supabase --version
npx supabase db lint --help
npm run lint
npm run typecheck
```

Expected: CLI/version help and static checks complete successfully.

- [ ] **Step 7: Commit local backend configuration**

```bash
git add package.json package-lock.json supabase .env.example README.md
git commit -m "chore: initialize local Supabase development"
```

### Task 6: Add Browser Smoke Tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/home.spec.ts`

- [ ] **Step 1: Install Playwright**

Run:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Expected: Playwright and Chromium install successfully.

- [ ] **Step 2: Create the Playwright configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Write the browser smoke test**

Create `e2e/home.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("shows the phone-first play choices", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose how to play" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Friend room" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pass the phone" }),
  ).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
```

- [ ] **Step 4: Run the browser test**

Run:

```bash
npm run test:e2e
```

Expected: one passing mobile Chromium test.

- [ ] **Step 5: Commit browser coverage**

```bash
git add package.json package-lock.json playwright.config.ts e2e
git commit -m "test: add mobile browser smoke coverage"
```

### Task 7: Add Continuous Integration

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run test:e2e
```

- [ ] **Step 2: Run the complete local verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: every command passes.

- [ ] **Step 3: Inspect the branch diff**

Run:

```bash
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors and only `.github/workflows/ci.yml` remains
uncommitted.

- [ ] **Step 4: Commit CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify application foundation"
```

### Task 8: Merge The Verified Foundation

**Files:**
- No new files.

- [ ] **Step 1: Re-run the section merge gate**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: every command passes from a clean worktree.

- [ ] **Step 2: Merge the section into main**

Run:

```bash
git checkout main
git merge --no-ff tade/foundation-ci -m "merge: add application foundation"
```

Expected: the merge completes without conflicts.

- [ ] **Step 3: Verify main**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git status --short --branch
```

Expected: all checks pass and `main` has no uncommitted files.
