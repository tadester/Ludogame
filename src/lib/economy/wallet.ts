import { createClient } from "@/lib/supabase/server";

import type { PlayerWallet } from "./economy";

const DEFAULT_WALLET: PlayerWallet = {
  coins: 0,
  role: "player",
  banned: false,
};

/** Load the signed-in player's wallet for the shell/nav. Falls back to safe
 *  defaults if the economy tables are unavailable, so it never breaks the app. */
export async function loadPlayerWallet(): Promise<PlayerWallet> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("get_player_wallet")
      .maybeSingle<PlayerWallet>();
    if (error || !data) return DEFAULT_WALLET;
    return {
      coins: data.coins ?? 0,
      role: data.role ?? "player",
      banned: !!data.banned,
    };
  } catch {
    return DEFAULT_WALLET;
  }
}
