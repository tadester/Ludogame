import { describe, expect, it } from "vitest";

import {
  describeTimer,
  isHost,
  validateInviteCode,
  validateRoomSettings,
} from "./rooms";
import type { Room } from "./rooms";

function settingsForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("ruleset", "classic");
  data.set("maxPlayers", "4");
  data.set("turnTimer", "none");
  data.set("boardSkin", "classic");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function codeForm(code: unknown): FormData {
  const data = new FormData();
  if (typeof code === "string") data.set("code", code);
  return data;
}

describe("validateInviteCode", () => {
  it("uppercases and accepts a valid code", () => {
    expect(validateInviteCode(codeForm("  ab12cd "))).toEqual({
      ok: true,
      value: { code: "AB12CD" },
    });
  });

  it("rejects codes of the wrong length or characters", () => {
    expect(validateInviteCode(codeForm("ABC12")).ok).toBe(false);
    expect(validateInviteCode(codeForm("ABC-12")).ok).toBe(false);
    expect(validateInviteCode(codeForm("")).ok).toBe(false);
  });
});

describe("validateRoomSettings", () => {
  it("accepts valid settings and normalizes the timer", () => {
    const result = validateRoomSettings(
      settingsForm({ ruleset: "nigerian", maxPlayers: "3", turnTimer: "60" }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        ruleset: "nigerian",
        maxPlayers: 3,
        boardSkin: "classic",
        turnTimerSeconds: 60,
        isRanked: false,
        entryFee: 0,
      },
    });
  });

  it("requires a positive entry fee for ranked rooms", () => {
    const ranked = validateRoomSettings(
      settingsForm({ isRanked: "on", entryFee: "250" }),
    );
    expect(ranked.ok && ranked.value).toMatchObject({
      isRanked: true,
      entryFee: 250,
    });
    expect(
      validateRoomSettings(settingsForm({ isRanked: "on", entryFee: "0" })).ok,
    ).toBe(false);
  });

  it("treats 'none' as no timer", () => {
    const result = validateRoomSettings(settingsForm({ turnTimer: "none" }));
    expect(result.ok && result.value.turnTimerSeconds).toBe(null);
  });

  it("rejects bad rulesets, player counts, and timers", () => {
    expect(validateRoomSettings(settingsForm({ ruleset: "speed" })).ok).toBe(false);
    expect(validateRoomSettings(settingsForm({ maxPlayers: "5" })).ok).toBe(false);
    expect(validateRoomSettings(settingsForm({ maxPlayers: "1" })).ok).toBe(false);
    expect(validateRoomSettings(settingsForm({ turnTimer: "45" })).ok).toBe(false);
  });
});

describe("room helpers", () => {
  const room = { id: "r1", host_id: "u1" } as Room;

  it("describes turn timers", () => {
    expect(describeTimer(null)).toBe("No timer");
    expect(describeTimer(30)).toBe("30s per turn");
  });

  it("identifies the host", () => {
    expect(isHost(room, "u1")).toBe(true);
    expect(isHost(room, "u2")).toBe(false);
    expect(isHost(room, null)).toBe(false);
  });
});
