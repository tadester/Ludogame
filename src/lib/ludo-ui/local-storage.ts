import type { MatchState, PowerKind, Ruleset } from "@/lib/ludo";

const MATCH_KEY = "ludo:match:v1";
const PREFS_KEY = "ludo:prefs:v1";

const RULESETS: readonly Ruleset[] = [
  "classic",
  "nigerian",
  "peaceful",
  "blitz",
  "extreme",
];
const POWERS: readonly PowerKind[] = [
  "shield",
  "dash",
  "warp",
  "snipe",
  "swap",
];

export interface LocalPreferences {
  readonly count: number;
  readonly ruleset: Ruleset;
  readonly names: readonly string[];
  /** The Extreme strategy-book loadout the player last equipped. */
  readonly loadout?: readonly PowerKind[];
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isMatchState(value: unknown): value is MatchState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.tokens) &&
    Array.isArray(v.players) &&
    typeof v.status === "string" &&
    typeof v.version === "number"
  );
}

/** Persists the in-progress match so a refresh can resume it. */
export function saveMatch(state: MatchState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(MATCH_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or serialization failures; persistence is best-effort.
  }
}

export function loadMatch(): MatchState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(MATCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMatchState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearMatch(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(MATCH_KEY);
  } catch {
    // Ignore.
  }
}

export function savePreferences(prefs: LocalPreferences): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore.
  }
}

export function loadPreferences(): LocalPreferences | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.count !== "number" ||
      !RULESETS.includes(parsed.ruleset as Ruleset) ||
      !Array.isArray(parsed.names)
    ) {
      return null;
    }
    const loadout = Array.isArray(parsed.loadout)
      ? parsed.loadout.filter((p): p is PowerKind =>
          POWERS.includes(p as PowerKind),
        )
      : undefined;
    return {
      count: parsed.count,
      ruleset: parsed.ruleset as Ruleset,
      names: parsed.names.map((n) => String(n)),
      ...(loadout ? { loadout } : {}),
    };
  } catch {
    return null;
  }
}
