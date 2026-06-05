# Ludo Platform Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each section plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Ludo platform through independently testable branches that merge only after verification.

**Architecture:** A Next.js PWA hosts the account and game interfaces, while a framework-independent TypeScript rules engine owns deterministic gameplay. Supabase provides authentication, PostgreSQL, Realtime, presence, and server-side persistence; trusted server handlers validate every online action.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright, Supabase Auth/PostgreSQL/Realtime, GitHub Actions

---

## Branch Sequence

Each section starts from an up-to-date `main`, uses the `tade/` prefix, follows
TDD, and commits after every passing task.

1. `tade/foundation-ci`
   - Scaffold the Next.js application.
   - Establish unit, component, browser, and CI test infrastructure.
   - Initialize local Supabase configuration.
   - Add the initial PWA manifest and responsive application shell.
   - Plan: `docs/superpowers/plans/2026-06-05-foundation-ci.md`

2. `tade/auth-account-shell`
   - Configure browser and server Supabase clients.
   - Implement email registration, verification, sign-in, sign-out, and reset.
   - Protect application routes and create the profile record/RLS policies.
   - Write this section plan after foundation merges.

3. `tade/rules-engine`
   - Define serializable match state, commands, events, and invariants.
   - Implement Classic Ludo through focused rule tests.
   - Implement Nigerian Ludo through the approved exact-roll examples.
   - Add property-based invariant and deterministic replay tests.
   - Write this section plan after authentication merges.

4. `tade/pass-the-phone`
   - Build local game setup for two to four participants.
   - Add temporary player names and private handoff screens.
   - Render the shared board and complete both rulesets locally.
   - Add complete-match browser tests.
   - Write this section plan after the rules engine merges.

5. `tade/friends-private-rooms`
   - Add friendship, presence, invitations, rooms, seats, and invite codes.
   - Enforce membership and visibility through RLS.
   - Implement host settings and room lifecycle.
   - Write this section plan after local play merges.

6. `tade/online-multiplayer`
   - Persist versioned match snapshots and append-only domain events.
   - Add trusted roll/move handlers and atomic optimistic concurrency.
   - Add Realtime subscriptions, reconnect, timeout automation, and forfeits.
   - Add multiplayer conflict and recovery browser tests.
   - Write this section plan after rooms merge.

7. `tade/customization`
   - Add cosmetic catalog, ownership, loadouts, and host board selection.
   - Apply per-player backgrounds, dice, tokens, animations, and sounds.
   - Add reduced-motion and muted-audio behavior.
   - Write this section plan after multiplayer merges.

8. `tade/pwa-polish`
   - Finish installability, offline static asset caching, responsive layouts,
     accessibility, loading/error states, and the temporary competitive theme.
   - Run full release verification.
   - Write this section plan after customization merges.

## Merge Gate

Before merging a section branch:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm run test:e2e` when the section changes a user journey. Run local
Supabase database tests and linting when the section changes migrations, RLS,
or trusted database functions.

The merge commit must identify the completed section. Delete the merged branch
only after `main` passes the same verification.

