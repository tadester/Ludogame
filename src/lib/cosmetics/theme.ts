import { createClient } from "@/lib/supabase/server";

export interface PlayerTheme {
  readonly background: string;
  readonly board: string;
  readonly dice: string;
  readonly token: string;
  readonly animation: string;
  readonly reducedMotion: boolean;
  readonly mutedAudio: boolean;
}

const DEFAULT_THEME: PlayerTheme = {
  background: "mikayla",
  board: "classic",
  dice: "classic",
  token: "classic",
  animation: "standard",
  reducedMotion: false,
  mutedAudio: false,
};

export interface BoardSkinOption {
  readonly code: string;
  readonly name: string;
}

const CLASSIC_BOARD: BoardSkinOption = { code: "classic", name: "Classic" };

/** The board skins the signed-in player owns (always at least Classic), for
 *  the room board-skin picker. Falls back to just Classic on any error. */
export async function loadOwnedBoardSkins(): Promise<BoardSkinOption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_cosmetics");
    if (error || !data) return [CLASSIC_BOARD];
    const skins = (data as Array<Record<string, unknown>>)
      .filter((row) => row.kind === "board" && row.owned)
      .map((row) => ({ code: String(row.code), name: String(row.name) }));
    return skins.length > 0 ? skins : [CLASSIC_BOARD];
  } catch {
    return [CLASSIC_BOARD];
  }
}

/** Resolve the signed-in player's equipped theme for the app shell. Falls back
 *  to defaults if cosmetics are unavailable, so it never breaks the shell. */
export async function loadPlayerTheme(): Promise<PlayerTheme> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("get_player_theme")
      .maybeSingle<{
        background_code: string | null;
        board_code: string | null;
        dice_code: string | null;
        token_code: string | null;
        animation_code: string | null;
        reduced_motion: boolean | null;
        muted_audio: boolean | null;
      }>();
    if (error || !data) return DEFAULT_THEME;
    return {
      background: data.background_code ?? "mikayla",
      board: data.board_code ?? "classic",
      dice: data.dice_code ?? "classic",
      token: data.token_code ?? "classic",
      animation: data.animation_code ?? "standard",
      reducedMotion: !!data.reduced_motion,
      mutedAudio: !!data.muted_audio,
    };
  } catch {
    return DEFAULT_THEME;
  }
}
