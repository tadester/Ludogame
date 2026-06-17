import { describe, expect, it } from "vitest";

import { canAfford, formatCoins, isAdmin, isPurchasable } from "./economy";
import type { PlayerWallet, StoreItem } from "./economy";

const wallet: PlayerWallet = { coins: 200, role: "player", banned: false };

function item(overrides: Partial<StoreItem>): StoreItem {
  return {
    id: "i1",
    kind: "background",
    code: "aurora",
    name: "Aurora",
    description: "",
    price: 150,
    is_default: false,
    owned: false,
    ...overrides,
  };
}

describe("economy helpers", () => {
  it("formats coins with separators", () => {
    expect(formatCoins(1000000)).toBe("1,000,000");
    expect(formatCoins(50)).toBe("50");
  });

  it("detects admins", () => {
    expect(isAdmin({ ...wallet, role: "admin" })).toBe(true);
    expect(isAdmin(wallet)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("checks affordability", () => {
    expect(canAfford(wallet, 150)).toBe(true);
    expect(canAfford(wallet, 300)).toBe(false);
    expect(canAfford(null, 0)).toBe(false);
  });

  it("only allows purchasing unowned, affordable, non-default items", () => {
    expect(isPurchasable(item({}), wallet)).toBe(true);
    expect(isPurchasable(item({ owned: true }), wallet)).toBe(false);
    expect(isPurchasable(item({ is_default: true }), wallet)).toBe(false);
    expect(isPurchasable(item({ price: 300 }), wallet)).toBe(false);
  });
});
