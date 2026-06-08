import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["/play?mode=classic", "/play?mode=classic"],
    ["https://example.com", "/"],
    ["//example.com/path", "/"],
    ["profile", "/"],
    ["/\\example.com", "/"],
    [null, "/"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
