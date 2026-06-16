export type CosmeticKind =
  | "background"
  | "board"
  | "dice"
  | "token"
  | "animation"
  | "sound"
  | "effect";

export interface CosmeticItem {
  readonly id: string;
  readonly kind: CosmeticKind;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly is_default: boolean;
  readonly sort_order: number;
  readonly owned: boolean;
}

export interface PlayerCosmetics {
  readonly background_item_id: string | null;
  readonly board_item_id: string | null;
  readonly dice_item_id: string | null;
  readonly token_item_id: string | null;
  readonly animation_item_id: string | null;
  readonly sound_item_id: string | null;
  readonly effect_item_id: string | null;
  readonly reduced_motion: boolean;
  readonly muted_audio: boolean;
}

export const KIND_ORDER: readonly CosmeticKind[] = [
  "background",
  "board",
  "dice",
  "token",
  "animation",
  "sound",
  "effect",
];

export const KIND_LABELS: Record<CosmeticKind, string> = {
  background: "Backgrounds",
  board: "Boards",
  dice: "Dice",
  token: "Tokens",
  animation: "Animations",
  sound: "Sounds",
  effect: "Effects",
};

const SLOT: Record<CosmeticKind, keyof PlayerCosmetics> = {
  background: "background_item_id",
  board: "board_item_id",
  dice: "dice_item_id",
  token: "token_item_id",
  animation: "animation_item_id",
  sound: "sound_item_id",
  effect: "effect_item_id",
};

/** Group catalog items by kind in the canonical kind/sort order. */
export function groupByKind(
  items: readonly CosmeticItem[],
): { kind: CosmeticKind; items: CosmeticItem[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    items: items
      .filter((item) => item.kind === kind)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}

/** The currently equipped item id for a kind, if any. */
export function equippedItemId(
  loadout: PlayerCosmetics | null,
  kind: CosmeticKind,
): string | null {
  if (!loadout) return null;
  return (loadout[SLOT[kind]] as string | null) ?? null;
}
