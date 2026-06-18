import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  MatchAuthorizationError,
  startMatch,
} from "@/lib/ludo-online/match-service";
import { createSupabaseMatchStore } from "@/lib/ludo-online/supabase-store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface MemberRow {
  user_id: string;
  seat: number;
  display_name: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, host_id, ruleset")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }

  const { data: memberData, error: memberError } = await supabase.rpc(
    "list_room_members",
    { p_room_id: roomId },
  );
  if (memberError) {
    return NextResponse.json({ error: "members_failed" }, { status: 500 });
  }
  const members = (memberData ?? []) as MemberRow[];
  if (members.length < 2) {
    return NextResponse.json({ error: "need_two_players" }, { status: 400 });
  }

  try {
    const store = createSupabaseMatchStore(createServiceClient());
    const match = await startMatch({
      store,
      roomId,
      requesterId: userId,
      hostId: room.host_id,
      seats: members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        seat: m.seat,
      })),
      ruleset: room.ruleset,
      snapshotId: randomUUID(),
    });
    return NextResponse.json({ matchId: match.id });
  } catch (error) {
    if (error instanceof MatchAuthorizationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (
      error instanceof Error &&
      error.message === "SUPABASE_SERVICE_ROLE_KEY is not configured"
    ) {
      return NextResponse.json(
        { error: "service_not_configured" },
        { status: 500 },
      );
    }
    console.error("Unable to start room match", error);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }
}
