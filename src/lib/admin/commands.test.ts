import { describe, expect, it } from "vitest";

import { helpLines, normalizeUserArg, parseCommand } from "./commands";

describe("parseCommand", () => {
  it("parses a slash command with args", () => {
    expect(parseCommand("/give @ada 500")).toEqual({
      name: "give",
      args: ["@ada", "500"],
    });
  });

  it("works without the leading slash and lowercases the name", () => {
    expect(parseCommand("BAN someone")).toEqual({
      name: "ban",
      args: ["someone"],
    });
  });

  it("collapses extra whitespace and returns null for blanks", () => {
    expect(parseCommand("  /stats   ")).toEqual({ name: "stats", args: [] });
    expect(parseCommand("   ")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("normalizeUserArg", () => {
  it("strips a leading @ and trims", () => {
    expect(normalizeUserArg("@ada")).toBe("ada");
    expect(normalizeUserArg(" bob ")).toBe("bob");
    expect(normalizeUserArg(undefined)).toBe("");
  });
});

describe("helpLines", () => {
  it("lists every command", () => {
    const lines = helpLines();
    expect(lines[0]).toMatch(/available commands/i);
    expect(lines.some((l) => l.includes("/give"))).toBe(true);
    expect(lines.some((l) => l.includes("/ban"))).toBe(true);
    expect(lines.some((l) => l.includes("/help"))).toBe(true);
  });
});
