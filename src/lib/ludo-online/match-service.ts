import type { DomainEvent, MatchState, Ruleset } from "@/lib/ludo";

import { buildStartedMatch, resolveIntent } from "./authority";
import type { DiceRng, OnlineSeat, ServerIntent } from "./authority";

/** A persisted match as the store sees it. `id` is the store's match id, which
 *  may differ from the engine snapshot's internal id. */
export interface StoredMatch {
  readonly id: string;
  readonly version: number;
  readonly snapshot: MatchState;
}

/** Persistence boundary for online matches. The Supabase adapter backs this in
 *  production; tests use an in-memory implementation. */
export interface MatchStore {
  loadByRoom(roomId: string): Promise<StoredMatch | null>;
  load(matchId: string): Promise<StoredMatch | null>;
  create(roomId: string, snapshot: MatchState): Promise<StoredMatch>;
  /** Commit a new snapshot + events with optimistic concurrency. Must throw
   *  {@link VersionConflictError} when expectedVersion is stale. */
  commit(
    matchId: string,
    expectedVersion: number,
    snapshot: MatchState,
    events: readonly DomainEvent[],
  ): Promise<number>;
}

export class VersionConflictError extends Error {
  constructor() {
    super("The match changed before this action could be committed.");
    this.name = "VersionConflictError";
  }
}

export class MatchAuthorizationError extends Error {
  constructor(message = "Not authorized for this match action.") {
    super(message);
    this.name = "MatchAuthorizationError";
  }
}

export interface StartMatchOptions {
  readonly store: MatchStore;
  readonly roomId: string;
  readonly requesterId: string;
  readonly hostId: string;
  readonly seats: readonly OnlineSeat[];
  readonly ruleset: Ruleset;
  /** Engine-internal id for the snapshot. */
  readonly snapshotId: string;
}

/** Start the room's match. Only the host may start it; calling again returns
 *  the existing match so the action is idempotent. */
export async function startMatch(
  options: StartMatchOptions,
): Promise<StoredMatch> {
  if (options.requesterId !== options.hostId) {
    throw new MatchAuthorizationError("Only the host can start the match.");
  }

  const existing = await options.store.loadByRoom(options.roomId);
  if (existing) {
    return existing;
  }

  const snapshot = buildStartedMatch(
    options.snapshotId,
    options.seats,
    options.ruleset,
  );
  return options.store.create(options.roomId, snapshot);
}

export interface SubmitIntentOptions {
  readonly store: MatchStore;
  readonly matchId: string;
  readonly userId: string;
  readonly intent: ServerIntent;
  readonly rng: DiceRng;
}

export interface SubmitIntentResult {
  readonly snapshot: MatchState;
  readonly events: readonly DomainEvent[];
  readonly version: number;
}

/** Apply a player's intent to the current snapshot and commit it. Dice are
 *  generated server-side; the engine enforces legality and the store enforces
 *  optimistic concurrency. */
export async function submitIntent(
  options: SubmitIntentOptions,
): Promise<SubmitIntentResult> {
  const current = await options.store.load(options.matchId);
  if (!current) {
    throw new MatchAuthorizationError("Match not found.");
  }

  const { state, events } = resolveIntent(
    current.snapshot,
    options.userId,
    options.intent,
    options.rng,
  );

  const version = await options.store.commit(
    options.matchId,
    current.version,
    state,
    events,
  );

  return { snapshot: state, events, version };
}
