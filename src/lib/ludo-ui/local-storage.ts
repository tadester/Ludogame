import type {
  MatchState,
  PowerKind,
  Ruleset,
  UltimateKind,
} from "@/lib/ludo";

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
  "summon",
  "bolt",
];
const SEAT_KINDS = ["human", "bot"] as const;
type SeatKind = (typeof SEAT_KINDS)[number];

export interface LocalPreferences {
  readonly count: number;
  readonly ruleset: Ruleset;
  readonly names: readonly string[];
  readonly seatKinds?: readonly SeatKind[];
  /** The Extreme strategy-book loadout the player last equipped. */
  readonly loadout?: readonly PowerKind[];
  /** The Extreme ultimate the player last equipped. */
  readonly ultimate?: UltimateKind;
}

const ULTIMATES: readonly UltimateKind[] = ["meteor", "quake", "surge"];

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
    const ultimate = ULTIMATES.includes(parsed.ultimate as UltimateKind)
      ? (parsed.ultimate as UltimateKind)
      : undefined;
    const seatKinds = Array.isArray(parsed.seatKinds)
      ? parsed.seatKinds.filter((kind): kind is SeatKind =>
          SEAT_KINDS.includes(kind as SeatKind),
        )
      : undefined;
    return {
      count: parsed.count,
      ruleset: parsed.ruleset as Ruleset,
      names: parsed.names.map((n) => String(n)),
      ...(seatKinds ? { seatKinds } : {}),
      ...(loadout ? { loadout } : {}),
      ...(ultimate ? { ultimate } : {}),
    };
  } catch {
    return null;
  }
}
