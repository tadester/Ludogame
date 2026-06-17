import { afterEach, describe, expect, it } from "vitest";

import {
  clearMatch,
  loadMatch,
  loadPreferences,
  saveMatch,
  savePreferences,
} from "./local-storage";
import { setupLocalMatch } from "./local-game";

afterEach(() => {
  localStorage.clear();
});

describe("local-storage", () => {
  it("round-trips a saved match", () => {
    const state = setupLocalMatch([{ name: "Ada" }, { name: "Ben" }]);
    saveMatch(state);
    expect(loadMatch()).toEqual(state);
  });

  it("clears a saved match", () => {
    saveMatch(setupLocalMatch([{ name: "Ada" }, { name: "Ben" }]));
    clearMatch();
    expect(loadMatch()).toBeNull();
  });

  it("returns null for missing or corrupt data", () => {
    expect(loadMatch()).toBeNull();
    localStorage.setItem("ludo:match:v1", "not json");
    expect(loadMatch()).toBeNull();
    localStorage.setItem("ludo:match:v1", JSON.stringify({ nope: true }));
    expect(loadMatch()).toBeNull();
  });

  it("round-trips preferences and rejects invalid ones", () => {
    savePreferences({ count: 3, ruleset: "nigerian", names: ["A", "B", "C"] });
    expect(loadPreferences()).toEqual({
      count: 3,
      ruleset: "nigerian",
      names: ["A", "B", "C"],
    });

    localStorage.setItem("ludo:prefs:v1", JSON.stringify({ count: 2 }));
    expect(loadPreferences()).toBeNull();
  });

  it("round-trips the Extreme ruleset and strategy-book loadout", () => {
    savePreferences({
      count: 2,
      ruleset: "extreme",
      names: ["A", "B"],
      loadout: ["dash", "snipe"],
    });
    expect(loadPreferences()).toEqual({
      count: 2,
      ruleset: "extreme",
      names: ["A", "B"],
      loadout: ["dash", "snipe"],
    });
  });

  it("drops unknown powers from a saved loadout", () => {
    localStorage.setItem(
      "ludo:prefs:v1",
      JSON.stringify({
        count: 2,
        ruleset: "blitz",
        names: ["A", "B"],
        loadout: ["dash", "bogus"],
      }),
    );
    expect(loadPreferences()?.loadout).toEqual(["dash"]);
  });
});
