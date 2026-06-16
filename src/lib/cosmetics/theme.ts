import { createClient } from "@/lib/supabase/server";

export interface PlayerTheme {
  readonly background: string;
  readonly reducedMotion: boolean;
  readonly mutedAudio: boolean;
}

const DEFAULT_THEME: PlayerTheme = {
  background: "midnight",
  reducedMotion: false,
  mutedAudio: false,
};

/** Resolve the signed-in player's equipped theme for the app shell. Falls back
 *  to defaults if cosmetics are unavailable, so it never breaks the shell. */
export async function loadPlayerTheme(): Promise<PlayerTheme> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("get_player_theme")
      .maybeSingle<{
        background_code: string | null;
        reduced_motion: boolean | null;
        muted_audio: boolean | null;
      }>();
    if (error || !data) return DEFAULT_THEME;
    return {
      background: data.background_code ?? "midnight",
      reducedMotion: !!data.reduced_motion,
      mutedAudio: !!data.muted_audio,
    };
  } catch {
    return DEFAULT_THEME;
  }
}
