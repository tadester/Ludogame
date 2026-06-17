import { NextResponse } from "next/server";

import { commitSystemAction } from "@/lib/ludo-online/match-service";
import { setConnectionForUser } from "@/lib/ludo-online/match-automation";
import { createSupabaseMatchStore } from "@/lib/ludo-online/supabase-store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** A player reports their own presence (e.g. on focus/blur or reconnect). */
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

  const body = (await request.json().catch(() => null)) as {
    connected?: unknown;
  } | null;
  if (typeof body?.connected !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const store = createSupabaseMatchStore(createServiceClient());
  try {
    const result = await commitSystemAction(store, matchId, (snapshot) =>
      setConnectionForUser(snapshot, userId, body.connected as boolean),
    );
    return NextResponse.json({ version: result.version });
  } catch {
    return NextResponse.json({ error: "connection_failed" }, { status: 500 });
  }
}
