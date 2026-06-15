# Ludo

A phone-first, installable Ludo game built with Next.js, React, TypeScript, and
Supabase. The planned first release supports Classic Ludo, Nigerian house rules,
pass-the-phone play, private friend rooms, online multiplayer, and cosmetic
customization.

> **Project status:** Active development. The application foundation,
> email/password account system, protected app shell, and first rules-engine
> contracts are implemented. Complete playable matches are not implemented yet.

## Current Progress

### Implemented

- Next.js 16 App Router application using React 19 and TypeScript.
- Phone-first dark application shell with Play, Friends, Customize, and Profile
  areas.
- Installable PWA manifest and mobile browser smoke-test foundation.
- Unit/component testing with Vitest and Testing Library.
- Browser testing with Playwright.
- GitHub Actions verification foundation.
- Local Supabase development configuration.
- Supabase email/password sign-up and sign-in.
- Email verification callback flow.
- Forgot-password and password-update flows.
- Protected routes with server-side session validation and refresh.
- Sign-out and editable protected profile screens.
- `profiles` database migration, trigger, grants, and Row Level Security tests.
- Pure TypeScript Ludo engine types for matches, players, tokens, dice, actions,
  events, replay entries, and legal turn sequences.
- Immutable, JSON-safe rules-engine contracts.
- Shared 52-space ring topology, color opening indexes, Classic safe-space
  indexes, home-lane bounds, and exact-win progress constants.
- Property-testing dependency (`fast-check`) for upcoming engine invariants.
- Complete Classic and Nigerian rules engine: match creation, legal actions,
  movement, captures, home entry, turn flow, deterministic replay, and
  invariant validation.
- Playable pass-the-phone board UI with animated tokens and dice, private turn
  handoff screens, and owner-scoped local match and preference persistence.
- Friends: send, accept, decline, and remove requests, plus add-by-username,
  backed by a `friendships` model with atomic functions and Row Level Security.
- Private rooms: create with a generated invite code, join by code into a
  numbered seat, host controls for ruleset, player count, board skin, and
  optional 30/60/90-second turn timers, and host handoff on leave.
- Direct friend-to-room invites with atomic accept/decline.
- Detailed product, architecture, authentication, foundation, and rules-engine
  implementation plans under `docs/superpowers`.

### Partially Implemented

- **PWA:** manifest and shell exist; service-worker caching, offline behavior,
  install prompts, accessibility polish, and final responsive QA remain.
- **Rooms:** lobbies, seats, invites, and host settings exist; starting an
  online match from a room and in-room presence remain.
- **Customize:** a protected placeholder page exists; its database model and
  product behavior remain.

### Not Implemented Yet

- Friend and room presence indicators.
- Starting a server-authoritative match from a private room.
- Server-authoritative online matches and Realtime synchronization.
- Reconnect windows, turn timers, automated timeout moves, and forfeits.
- Cosmetic catalogs, ownership, loadouts, backgrounds, boards, dice, tokens,
  animation packs, sounds, and visual effects.
- Complete-match browser tests and production deployment configuration.

## Game Modes

### Classic Ludo

- Two to four players with four tokens each.
- One die per roll.
- A six releases a token or moves an active token six spaces.
- Rolling a six grants one additional roll.
- Captures return opposing tokens to their yard.
- Standard safe spaces prevent captures.
- All four tokens must reach home to win.
- Home entry requires an exact roll.

### Nigerian Ludo

This mode represents the project owner's Nigerian house rules rather than one
universal African ruleset.

- Two to four players with four tokens each.
- Every roll uses two dice.
- A six can release a token from the yard.
- Only double six grants a dice-based bonus roll.
- The player chooses the order in which dice are resolved.
- With multiple playable tokens, each die is a separate uninterrupted move and
  may be assigned to a different token.
- If only one token can be played, both dice are combined into one uninterrupted
  move; intermediate spaces do not trigger captures.
- Both dice must be used whenever legally possible.
- If all tokens are in the yard, a roll without a six ends the turn.
- If all tokens are in the yard and the roll is six plus another value, the six
  releases a token and the other die moves that token.
- Capturing returns one opposing token to its yard and immediately makes the
  capturing token won.
- Same-color tokens may share a space and never block movement.
- There are no general safe spaces. A color's opening square protects only that
  color's tokens.
- An opponent can stop on another color's occupied opening square without
  capturing the protected token.
- Releasing onto an opponent on the releasing color's opening square captures
  that opponent and makes the released token won.
- Reaching home requires an exact roll, makes the token won, and grants one
  bonus roll.
- Bonus-roll conditions do not stack for a single roll.
- A remaining die may be discarded only when one die takes a token home and no
  other token can legally use the remaining die.
- The first player to make all four tokens won wins.

Special Effect Mode is planned as a separate future mode and is not part of the
first release.

## Architecture

- **Web application:** Next.js App Router, React, Tailwind CSS, and TypeScript.
- **Accounts and data:** Supabase Auth, PostgreSQL, Row Level Security,
  Realtime, and presence.
- **Rules:** a framework-independent module under `src/lib/ludo`. It must not
  depend on React, Next.js, browser APIs, or Supabase.
- **Online authority:** trusted server handlers will validate actions, generate
  dice, apply the shared rules engine, and persist state plus domain events
  atomically.
- **Concurrency:** actions carry an expected match version so stale, duplicate,
  and conflicting actions can be rejected safely.
- **Local play:** pass-the-phone will use the same serializable state and rules
  engine as online play.
- **Cosmetics:** visual customization must never affect legal moves, dice
  probability, timers, or win conditions.

## Remaining Roadmap

Development uses focused `tade/*` branches, test-driven development, and a
commit after each verified task.

1. **Finish the shared rules engine**
   - Create and join matches, assign seats, and start deterministically.
   - Implement complete Classic rules.
   - Implement complete Nigerian two-die rules.
   - Add disconnect, timeout, reconnect, and forfeit lifecycle behavior.
   - Enumerate complete legal turn sequences for automatic timeout play.
   - Add deterministic replay, invariant validation, and property-based tests.

2. **Build pass-the-phone**
   - Set up two to four local participants with temporary names.
   - Render the board, tokens, dice, legal actions, and match results.
   - Add private handoff screens between turns.
   - Save owner-scoped local match state and preferences.
   - Test complete Classic and Nigerian local matches.

3. **Build friends and private rooms**
   - Add friend requests, acceptance, removal, presence, and direct invites.
   - Add private rooms, invite codes, two to four seats, and host controls.
   - Support ruleset, shared board skin, and optional 30/60/90-second timers.
   - Enforce all access with database constraints, atomic functions, and RLS.

4. **Build online multiplayer**
   - Persist versioned snapshots and append-only match events.
   - Add idempotent, server-authoritative roll and move handlers.
   - Synchronize clients through Realtime with snapshot resync on conflicts.
   - Add two-minute reconnect handling, timeout automation, and forfeits.
   - Test races, stale actions, reconnects, and completed online matches.

5. **Build customization**
   - Add backgrounds, including future anime-style packs.
   - Add board, dice, token, animation, sound, and effect packs.
   - Add catalog, ownership, loadout, and preference data.
   - Respect reduced-motion and muted-audio preferences.

6. **Finish PWA and interface polish**
   - Add safe static-asset caching and defined offline behavior.
   - Complete responsive board layouts, accessibility, and loading/error states.
   - Improve installability and run the full release verification suite.
   - Replace the temporary visual direction when final UI/art is ready.

Deferred beyond the first release: public matchmaking, native App Store/Play
Store packaging, social sign-in, monetization, and Special Effect Mode.

## Requirements

- Node.js 20.19 or newer
- npm
- Docker-compatible container runtime for local Supabase

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local Supabase:

   ```bash
   npm run db:start
   ```

3. Copy `.env.example` to `.env.local`.
4. Run `npm run db:status` and place the local API URL and publishable key in
   `.env.local`.
5. Start the application:

   ```bash
   npm run dev
   ```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run db:lint
npm run db:test
```

Database and end-to-end checks require the local Supabase stack. Focused unit
tests can run without it.

## Project Documentation

- Product design: `docs/superpowers/specs/2026-06-05-ludo-platform-design.md`
- Delivery roadmap: `docs/superpowers/plans/2026-06-05-ludo-platform-roadmap.md`
- Foundation plan: `docs/superpowers/plans/2026-06-05-foundation-ci.md`
- Authentication plan:
  `docs/superpowers/plans/2026-06-07-auth-account-shell.md`
- Rules-engine plan:
  `docs/superpowers/plans/2026-06-12-rules-engine.md`
