import { redirect } from "next/navigation";

import { OnlineMatch } from "@/components/ludo/online-match";
import type { MatchState } from "@/lib/ludo";
import { createClient } from "@/lib/supabase/server";

type MatchPageProps = {
  params: Promise<{ matchId: string }>;
};

export default async function MatchPage({ params }: MatchPageProps) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("matches")
    .select("id, room_id, snapshot")
    .eq("id", matchId)
    .maybeSingle<{ id: string; room_id: string; snapshot: MatchState }>();

  if (!data) {
    redirect("/rooms?message=That+match+is+no+longer+available.");
  }

  // The board skin is shared (host's room choice); dice and tokens are each
  // player's own equipped cosmetics.
  const [{ data: room }, { data: theme }] = await Promise.all([
    supabase
      .from("rooms")
      .select("board_skin")
      .eq("id", data.room_id)
      .maybeSingle<{ board_skin: string }>(),
    supabase.rpc("get_player_theme").maybeSingle<{
      background_code: string | null;
      dice_code: string | null;
      token_code: string | null;
      animation_code: string | null;
      effect_code: string | null;
    }>(),
  ]);

  return (
    <OnlineMatch
      matchId={data.id}
      userId={userId}
      initial={data.snapshot}
      boardSkin={room?.board_skin ?? "classic"}
      backgroundSkin={theme?.background_code ?? "midnight"}
      diceSkin={theme?.dice_code ?? "ivory"}
      tokenSkin={theme?.token_code ?? "classic"}
      animationSkin={theme?.animation_code ?? "standard"}
      effectSkin={theme?.effect_code ?? "none"}
    />
  );
}
