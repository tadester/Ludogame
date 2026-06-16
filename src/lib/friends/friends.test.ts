import { describe, expect, it } from "vitest";

import { groupFriends, validateFriendUsername } from "./friends";
import type { FriendRow } from "./friends";

function row(overrides: Partial<FriendRow>): FriendRow {
  return {
    friendship_id: "f1",
    friend_id: "u1",
    display_name: "Friend",
    username: null,
    status: "accepted",
    direction: "accepted",
    created_at: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

function form(username: unknown): FormData {
  const data = new FormData();
  if (typeof username === "string") data.set("username", username);
  return data;
}

describe("groupFriends", () => {
  it("splits rows into friends, incoming, and outgoing", () => {
    const grouped = groupFriends([
      row({ friendship_id: "a", direction: "accepted", status: "accepted" }),
      row({ friendship_id: "b", direction: "incoming", status: "pending" }),
      row({ friendship_id: "c", direction: "outgoing", status: "pending" }),
      row({ friendship_id: "d", direction: "incoming", status: "pending" }),
    ]);

    expect(grouped.friends.map((r) => r.friendship_id)).toEqual(["a"]);
    expect(grouped.incoming.map((r) => r.friendship_id)).toEqual(["b", "d"]);
    expect(grouped.outgoing.map((r) => r.friendship_id)).toEqual(["c"]);
  });

  it("returns empty groups for no rows", () => {
    expect(groupFriends([])).toEqual({
      friends: [],
      incoming: [],
      outgoing: [],
    });
  });
});

describe("validateFriendUsername", () => {
  it("accepts and normalizes a valid username", () => {
    const result = validateFriendUsername(form("  Bola_NG  "));
    expect(result).toEqual({ ok: true, value: { username: "bola_ng" } });
  });

  it("requires a username", () => {
    expect(validateFriendUsername(form("")).ok).toBe(false);
    expect(validateFriendUsername(form(undefined)).ok).toBe(false);
  });

  it("rejects malformed usernames", () => {
    expect(validateFriendUsername(form("ab")).ok).toBe(false);
    expect(validateFriendUsername(form("has spaces")).ok).toBe(false);
    expect(validateFriendUsername(form("no-dashes")).ok).toBe(false);
  });
});
