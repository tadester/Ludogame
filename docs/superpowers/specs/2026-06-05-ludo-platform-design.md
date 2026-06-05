# Ludo Platform Design

## Summary

Build a phone-first, installable Ludo PWA using Next.js and Supabase. Every
mode requires an authenticated account, although pass-the-phone participants
other than the device owner use temporary display names.

The first release includes Classic Ludo, the owner's Nigerian Ludo rules,
pass-the-phone play, private online friend rooms, friend lists and invitations,
and cosmetic customization. Public matchmaking, native mobile packaging, and
Special Effect Mode are deferred.

The initial visual direction is a clean, dark, competitive interface. It is a
replaceable baseline rather than a final brand system.

## Product Areas

The signed-in application has four primary areas:

- Play: create or join friend rooms and start pass-the-phone games.
- Friends: manage friends, presence, room invitations, and pending requests.
- Customize: equip backgrounds, board skins, dice, tokens, animations, sounds,
  and visual effects.
- Profile: manage account details and player preferences.

Email and password are the only launch authentication methods. The account
flow includes email verification and password reset.

## Game Modes

### Classic Ludo

Classic mode uses a standard modern ruleset:

- Two to four players with four tokens each.
- One die per roll.
- A six releases a token from the yard or moves an active token six spaces.
- Rolling a six grants another roll.
- Captures return opposing tokens to their yard.
- Standard safe spaces prevent captures.
- All four tokens must reach home to win.
- Home entry requires an exact roll.

Detailed edge cases will be encoded as explicit rule-engine tests before the
Classic implementation is accepted.

### Nigerian Ludo

Nigerian mode is the owner's house rules, not a claim about one universal
African ruleset.

- Two to four players.
- Each player starts with four tokens in the yard.
- Each roll uses two dice.
- A die showing six may release a token or move an active token six spaces.
- A double six may release two tokens and grants one bonus roll.
- Only double six grants a dice-based bonus roll.
- A player chooses which die to resolve first.
- With multiple playable tokens, each die is a separate move and may be
  assigned to a different token.
- A token that captures becomes won immediately and cannot receive the other
  die. The remaining die must be applied to another token when legal.
- If only one token can be played, both dice must be applied to it as one
  uninterrupted combined move. Intermediate squares do not trigger captures.
- Both dice must be used whenever legally possible.
- If every token is in the yard, a roll without a six ends the turn.
- If every token is in the yard and the roll is six plus another value, the
  six releases a token and the other die must move that newly released token.
- Captured opposing tokens return to their yard.
- The capturing token immediately becomes won.
- A token also becomes won by reaching home with an exact roll.
- Reaching home grants one bonus roll.
- Bonus conditions do not stack within one roll. A roll that qualifies through
  multiple conditions grants only one bonus roll.
- A bonus roll may itself earn another bonus roll.
- If one die brings a token home exactly and no other token can legally use the
  remaining die, the remaining die is discarded.
- If a playable token remains after another reaches home, remaining dice must
  be applied to that token when legal.
- Same-color tokens may share a space and do not block movement.
- Landing on a stack captures one opposing token, not the entire stack.
- There are no general safe spaces.
- A color's opening square protects only that color's tokens.
- An opponent may stop on another color's occupied opening square without
  capturing the protected token.
- Releasing a token onto an opponent occupying that token's opening square
  captures the opponent and immediately makes the released token won.
- The first player to make all four tokens won wins the match.

## Match Model

All game types use one serializable game-state model and deterministic action
interface. Rule modules determine legal actions and state transitions without
depending on React, networking, or Supabase.

Player and system commands include:

- create match
- join seat
- start match
- roll dice
- select die order
- release token
- move token
- resolve timeout
- forfeit player

Captures, home entries, bonus rolls, won tokens, turn advancement, and match
completion are rule-engine outcomes. Clients cannot submit those outcomes
directly.

The rules engine receives current state, a validated action, and server-provided
random values. It returns the next state plus domain events. Dice generation is
outside the pure rules module so tests can inject exact rolls.

Match events include rolls, moves, releases, captures, home entries, bonus
rolls, timeouts, disconnects, reconnects, forfeits, and match completion.
Persisted events support auditing and debugging, while a current-state snapshot
supports fast reconnects.

## Online Architecture

Next.js provides the PWA shell, responsive interface, authenticated routes, and
server endpoints. Supabase provides PostgreSQL, email authentication, Realtime,
and presence.

Online matches are server-authoritative:

- The client requests an action.
- Trusted server code authenticates the player, locks or version-checks the
  match, validates the action through the shared rules engine, generates dice
  when required, and persists the resulting state and events atomically.
- Clients subscribe to authorized room and match updates.
- Invalid, duplicate, stale, and late actions are rejected with the latest
  authoritative state version.
- Clients resynchronize from the server snapshot after conflicts or reconnects.

Sensitive keys remain server-only. Every exposed Supabase table uses Row Level
Security. Policies grant users access only to their own account data and to
rooms, friendships, invitations, and matches they are authorized to view.
Authorization never relies on user-editable metadata.

## Friends And Rooms

Users can send, accept, decline, and remove friend relationships. The friend
list displays available presence information and supports direct invitations.

Private rooms support:

- Invite-code joining.
- Direct friend invitations.
- Two to four seats.
- Host selection of ruleset, player count, shared board skin, and turn timer.
- Turn timer options of no timer, 30 seconds, 60 seconds, or 90 seconds.

When a timer expires, the server selects and resolves a random complete legal
turn sequence, including all mandatory dice usage. Three consecutive turn
timeouts forfeit that player. A completed turn without timing out resets the
consecutive-timeout count.

A disconnected player has two minutes to reconnect. Their active turn timer
continues during disconnection. If the reconnect window expires, the player
forfeits. In three- or four-player games, a forfeiting player's tokens are
removed and the remaining players continue. The match ends as soon as one
player satisfies the selected ruleset's win condition; no placement rounds
follow.

## Pass-The-Phone

The device owner must be signed in. Other local participants enter temporary
names and do not require accounts.

Pass-the-phone uses the same state model and rules engine as online matches.
Private handoff screens obscure the next player's actionable game information
until they confirm possession of the device. Local games do not require a live
multiplayer subscription, but authenticated ownership allows saved preferences
and future match-history support.

## Customization

Players can equip:

- Background themes, including future anime packs.
- Board skins.
- Dice skins and roll animations.
- Token styles.
- Movement, capture, and home-entry animation packs.
- Sound and visual-effect packs.

Cosmetics never alter movement rules, legal actions, dice probability, timers,
or win conditions. In online rooms, the host selects the shared board skin.
Each player sees their own equipped background, interface theme, dice, token,
animation, and sound preferences where those choices do not create conflicting
shared board state.

The visual and animation system must respect reduced-motion and muted-audio
preferences.

## Error Handling And Recovery

- Auth failures return users to a recoverable sign-in flow without exposing
  protected data.
- Room joins validate capacity, membership, invite validity, and match status.
- Actions include an expected state version to prevent double moves.
- Atomic database operations prevent partial rolls or moves.
- Realtime interruptions fall back to snapshot resynchronization.
- A reconnecting user resumes their existing seat rather than joining again.
- Server logs identify matches and actions without logging secrets or raw
  passwords.
- Local UI failures preserve the latest confirmed game state when possible.

## Testing Strategy

Development follows test-driven development.

- Unit tests cover legal-action generation and state transitions for every
  Classic and Nigerian rule, including exact dice examples and edge cases.
- Property-based tests cover invariants such as token counts, legal positions,
  turn ownership, and deterministic replay.
- Integration tests cover Supabase migrations, atomic match actions, auth,
  friendship permissions, room membership, Realtime visibility, and RLS.
- Browser tests cover registration, password recovery, friend invitations,
  room creation and joining, reconnection, pass-the-phone handoffs, and complete
  Classic and Nigerian matches.
- PWA checks cover manifest validity, responsive phone layouts, installability,
  and cached static assets.

No implementation task is complete until its focused tests pass. Shared or
high-risk changes also run the broader relevant suite.

## Delivery Workflow

Major sections are developed on separate branches using the `tade/` prefix:

1. Foundation and CI.
2. Authentication and account shell.
3. Shared rules engine.
4. Pass-the-phone.
5. Friends and private rooms.
6. Server-authoritative online multiplayer.
7. Customization.
8. PWA and interface polish.

Each branch is divided into small, focused tasks. For each task:

1. Write a failing test.
2. Implement the smallest change that passes it.
3. Refactor while tests remain green.
4. Run focused verification.
5. Commit the successful task.

Branches merge only after their unit, integration, and relevant browser tests
pass. Supabase schema changes use reviewed migrations, RLS, and security checks.
Credentials, local environment files, and service-role keys are never committed.

## Deferred Scope

- Public matchmaking.
- Special Effect Mode as a third ruleset.
- Native App Store and Play Store packaging.
- Social sign-in.
- Final anime-oriented UI and commissioned art.
- Monetization or cosmetic purchases.

## Success Criteria

The first release is successful when an authenticated user can:

- Play complete Classic and Nigerian matches through pass-the-phone.
- Add a friend, create a private room, invite that friend, reconnect after a
  temporary interruption, and finish an authoritative online match.
- Customize supported cosmetics without affecting gameplay fairness.
- Install and comfortably use the PWA on a phone.

All documented rule cases, RLS policies, multiplayer conflict handling, and
critical user journeys must have automated coverage.
