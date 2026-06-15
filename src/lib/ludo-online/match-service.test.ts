import { describe, expect, it } from "vitest";

import type { DomainEvent, MatchState } from "@/lib/ludo";

import { NotYourTurnError } from "./authority";
import type { OnlineSeat } from "./authority";
import {
  MatchAuthorizationError,
  startMatch,
  submitIntent,
  VersionConflictError,
} from "./match-service";
import type { MatchStore, StoredMatch } from "./match-service";

const SEATS: OnlineSeat[] = [
  { userId: "user-a", displayName: "Ada", seat: 1 },
  { userId: "user-b", displayName: "Ben", seat: 2 },
];

class MemoryStore implements MatchStore {
  private byId = new Map<string, StoredMatch>();
  private roomToId = new Map<string, string>();
  private counter = 0;
  public commits = 0;

  async loadByRoom(roomId: string): Promise<StoredMatch | null> {
    const id = this.roomToId.get(roomId);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async load(matchId: string): Promise<StoredMatch | null> {
    return this.byId.get(matchId) ?? null;
  }

  async create(roomId: string, snapshot: MatchState): Promise<StoredMatch> {
    this.counter += 1;
    const stored: StoredMatch = {
      id: `m-${this.counter}`,
      version: snapshot.version,
      snapshot,
    };
    this.byId.set(stored.id, stored);
    this.roomToId.set(roomId, stored.id);
    return stored;
  }

  async commit(
    matchId: string,
    expectedVersion: number,
    snapshot: MatchState,
    events: readonly DomainEvent[],
  ): Promise<number> {
    void events;
    this.commits += 1;
    const current = this.byId.get(matchId);
    if (!current) throw new Error("match not found");
    if (current.version !== expectedVersion) throw new VersionConflictError();
    this.byId.set(matchId, { id: matchId, version: snapshot.version, snapshot });
    return snapshot.version;
  }
}

function startOpts(store: MatchStore, requesterId = "user-a") {
  return {
    store,
    roomId: "room-1",
    requesterId,
    hostId: "user-a",
    seats: SEATS,
    ruleset: "classic" as const,
    snapshotId: "snap-1",
  };
}

describe("startMatch", () => {
  it("lets the host start a match", async () => {
    const store = new MemoryStore();
    const match = await startMatch(startOpts(store));
    expect(match.snapshot.status).toBe("active");
    expect(match.snapshot.players.map((p) => p.id)).toEqual([
      "user-a",
      "user-b",
    ]);
  });

  it("rejects a non-host starter", async () => {
    const store = new MemoryStore();
    await expect(startMatch(startOpts(store, "user-b"))).rejects.toThrow(
      MatchAuthorizationError,
    );
  });

  it("is idempotent for the same room", async () => {
    const store = new MemoryStore();
    const first = await startMatch(startOpts(store));
    const second = await startMatch(startOpts(store));
    expect(second.id).toBe(first.id);
  });
});

describe("submitIntent", () => {
  it("rolls for the active player and bumps the version", async () => {
    const store = new MemoryStore();
    const match = await startMatch(startOpts(store));
    const result = await submitIntent({
      store,
      matchId: match.id,
      userId: "user-a",
      intent: { kind: "roll" },
      rng: () => 6,
    });
    expect(result.version).toBe(match.version + 1);
    expect(result.snapshot.pendingRoll?.dice[0].value).toBe(6);
    expect(result.events.some((e) => e.type === "dice-rolled")).toBe(true);
  });

  it("rejects an action from the wrong player", async () => {
    const store = new MemoryStore();
    const match = await startMatch(startOpts(store));
    await expect(
      submitIntent({
        store,
        matchId: match.id,
        userId: "user-b",
        intent: { kind: "roll" },
        rng: () => 6,
      }),
    ).rejects.toThrow(NotYourTurnError);
  });

  it("surfaces a version conflict from the store", async () => {
    const store = new MemoryStore();
    const match = await startMatch(startOpts(store));
    // Mutate the stored version so the next commit sees a stale expectation.
    await submitIntent({
      store,
      matchId: match.id,
      userId: "user-a",
      intent: { kind: "roll" },
      rng: () => 6,
    });

    // The store is now at version 1, but this load reports a stale version 0,
    // so the real commit must reject it.
    const conflicting: MatchStore = {
      loadByRoom: () => Promise.resolve(null),
      load: () =>
        Promise.resolve({ id: match.id, version: 0, snapshot: match.snapshot }),
      create: () => Promise.reject(new Error("unused")),
      commit: store.commit.bind(store),
    };

    await expect(
      submitIntent({
        store: conflicting,
        matchId: match.id,
        userId: "user-a",
        intent: { kind: "roll" },
        rng: () => 6,
      }),
    ).rejects.toThrow(VersionConflictError);
  });
});
