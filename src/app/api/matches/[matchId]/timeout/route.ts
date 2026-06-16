import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";

import { commitSystemAction } from "@/lib/ludo-online/match-service";
import { resolveTurnTimeout } from "@/lib/ludo-online/match-automation";
import { secureDiceRng } from "@/lib/ludo-online/secure-rng";
import { createSupabaseMatchStore } from "@/lib/ludo-online/supabase-store";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Scheduler-triggered turn-timeout resolution. Authenticated with a shared
 * secret (MATCH_ADMIN_SECRET) rather than a user session, because it is
 * invoked by a trusted cron/edge job, not a player.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const secret = process.env.MATCH_ADMIN_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const store = createSupabaseMatchStore(createServiceClient());
  try {
    const result = await commitSystemAction(store, matchId, (snapshot) =>
      resolveTurnTimeout(snapshot, {
        rng: secureDiceRng(),
        selectSequence: (count) => randomInt(0, count),
      }),
    );
    return NextResponse.json({ version: result.version });
  } catch {
    return NextResponse.json({ error: "timeout_failed" }, { status: 500 });
  }
}
