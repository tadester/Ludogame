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
    .select("id, snapshot")
    .eq("id", matchId)
    .maybeSingle<{ id: string; snapshot: MatchState }>();

  if (!data) {
    redirect("/rooms?message=That+match+is+no+longer+available.");
  }

  return (
    <OnlineMatch matchId={data.id} userId={userId} initial={data.snapshot} />
  );
}
