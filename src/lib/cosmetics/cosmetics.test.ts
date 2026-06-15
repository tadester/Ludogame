import { describe, expect, it } from "vitest";

import { equippedItemId, groupByKind } from "./cosmetics";
import type { CosmeticItem, PlayerCosmetics } from "./cosmetics";

function item(overrides: Partial<CosmeticItem>): CosmeticItem {
  return {
    id: "x",
    kind: "background",
    code: "x",
    name: "X",
    description: "",
    is_default: false,
    sort_order: 0,
    owned: true,
    ...overrides,
  };
}

describe("groupByKind", () => {
  it("orders groups by kind and items by sort order", () => {
    const groups = groupByKind([
      item({ id: "b2", kind: "board", code: "b2", sort_order: 1 }),
      item({ id: "bg", kind: "background", code: "bg" }),
      item({ id: "b1", kind: "board", code: "b1", sort_order: 0 }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["background", "board"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b1", "b2"]);
  });

  it("omits kinds with no items", () => {
    const groups = groupByKind([item({ kind: "dice" })]);
    expect(groups.map((g) => g.kind)).toEqual(["dice"]);
  });
});

describe("equippedItemId", () => {
  const loadout = {
    background_item_id: "bg-1",
    board_item_id: null,
    dice_item_id: "dice-1",
    token_item_id: null,
    animation_item_id: null,
    sound_item_id: null,
    effect_item_id: null,
    reduced_motion: false,
    muted_audio: false,
  } satisfies PlayerCosmetics;

  it("returns the equipped id per kind", () => {
    expect(equippedItemId(loadout, "background")).toBe("bg-1");
    expect(equippedItemId(loadout, "dice")).toBe("dice-1");
    expect(equippedItemId(loadout, "board")).toBeNull();
  });

  it("returns null for a missing loadout", () => {
    expect(equippedItemId(null, "background")).toBeNull();
  });
});
