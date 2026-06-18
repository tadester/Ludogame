import type { PowerKind, UltimateKind } from "@/lib/ludo";

/** Most powers a player may equip in their strategy book. */
export const STRATEGY_BOOK_CAP = 5;

export const POWER_ORDER: readonly PowerKind[] = [
  "shield",
  "dash",
  "warp",
  "snipe",
  "swap",
  "summon",
  "bolt",
];

export const POWER_LABEL: Record<PowerKind, string> = {
  shield: "Shield",
  dash: "Dash",
  warp: "Warp",
  snipe: "Snipe",
  swap: "Swap",
  summon: "Summon",
  bolt: "Bolt",
};

export const POWER_DESC: Record<PowerKind, string> = {
  shield: "Block the next capture on a token.",
  dash: "Your token's next move advances double.",
  warp: "Jump a token to the next safe square.",
  snipe: "Send an exposed enemy token home from range.",
  swap: "Swap one of your tokens with an enemy's.",
  summon: "Release a token from the yard without a six.",
  bolt: "Knock an exposed enemy token back six squares.",
};

export const POWER_FEEDBACK: Record<PowerKind, string> = {
  shield: "Shield raised. ",
  dash: "Dash armed. ",
  warp: "Warped to safety. ",
  snipe: "Snipe fired. ",
  swap: "Positions swapped. ",
  summon: "Token summoned. ",
  bolt: "Bolt struck. ",
};

export const ULTIMATE_ORDER: readonly UltimateKind[] = [
  "meteor",
  "quake",
  "surge",
];

export const ULTIMATE_LABEL: Record<UltimateKind, string> = {
  meteor: "Meteor",
  quake: "Quake",
  surge: "Surge",
};

export const ULTIMATE_DESC: Record<UltimateKind, string> = {
  meteor: "Strike one enemy token home from any range. (2 uses)",
  quake: "Knock every enemy ring token back eight. (3 uses)",
  surge: "Raise a shield on all your active tokens. (reusable)",
};
