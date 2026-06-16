import { NextResponse } from "next/server";

import { LudoRuleError } from "@/lib/ludo";
import {
  NotYourTurnError,
  parseServerIntent,
} from "@/lib/ludo-online/authority";
import {
  MatchAuthorizationError,
  submitIntent,
  VersionConflictError,
} from "@/lib/ludo-online/match-service";
import { secureDiceRng } from "@/lib/ludo-online/secure-rng";
import { createSupabaseMatchStore } from "@/lib/ludo-online/supabase-store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const intent = parseServerIntent(body?.intent);
  if (!intent) {
    return NextResponse.json({ error: "bad_intent" }, { status: 400 });
  }

  const store = createSupabaseMatchStore(createServiceClient());
  try {
    const result = await submitIntent({
      store,
      matchId,
      userId,
      intent,
      rng: secureDiceRng(),
    });
    return NextResponse.json({
      version: result.version,
      snapshot: result.snapshot,
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (
      error instanceof NotYourTurnError ||
      error instanceof MatchAuthorizationError
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof LudoRuleError) {
      return NextResponse.json({ error: "illegal_move" }, { status: 422 });
    }
    return NextResponse.json({ error: "intent_failed" }, { status: 500 });
  }
}
