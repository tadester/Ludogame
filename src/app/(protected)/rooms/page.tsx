import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createRoom,
  joinRoom,
  respondToRoomInvite,
} from "@/app/(protected)/rooms/actions";
import { RoomSettingsFields } from "@/app/(protected)/rooms/RoomSettingsFields";
import { loadOwnedBoardSkins } from "@/lib/cosmetics/theme";
import { describeTimer } from "@/lib/rooms/rooms";
import type { Room } from "@/lib/rooms/rooms";
import { createClient } from "@/lib/supabase/server";

interface RoomInvite {
  readonly invite_id: string;
  readonly room_id: string;
  readonly invite_code: string;
  readonly ruleset: string;
  readonly inviter_name: string;
  readonly created_at: string;
}

import styles from "./rooms.module.css";

type RoomsPageProps = {
  searchParams: Promise<{ message?: string }>;
};

const RULESET_LABELS: Record<string, string> = {
  classic: "Classic",
  nigerian: "Nigerian",
};

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .in("status", ["lobby", "in_progress"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load your rooms.");
  }

  const rooms = (data ?? []) as Room[];

  const { data: inviteData } = await supabase.rpc("list_room_invites");
  const invites = (inviteData ?? []) as RoomInvite[];

  const boardSkins = await loadOwnedBoardSkins();

  const { message } = await searchParams;

  return (
    <section className={styles.page}>
      <div>
        <p className="eyebrow">Friend rooms</p>
        <h1>Private rooms</h1>
        <p>Create a room and share the code, or join one a friend sent you.</p>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.columns}>
        <form action={createRoom} className={styles.panel}>
          <h2>Create a room</h2>
          <RoomSettingsFields boardSkins={boardSkins} showRanked />
          <button className="primary-button" type="submit">
            Create room
          </button>
        </form>

        <form action={joinRoom} className={styles.panel}>
          <h2>Join with a code</h2>
          <label>
            <span>Invite code</span>
            <input
              autoCapitalize="characters"
              className={styles.codeInput}
              maxLength={6}
              name="code"
              placeholder="ABC123"
              required
            />
          </label>
          <button className="primary-button" type="submit">
            Join room
          </button>
        </form>
      </div>

      {invites.length > 0 ? (
        <div className={styles.group}>
          <h2>Invites</h2>
          <ul className={styles.list}>
            {invites.map((invite) => (
              <li className={styles.row} key={invite.invite_id}>
                <span className={styles.name}>
                  {RULESET_LABELS[invite.ruleset] ?? invite.ruleset} room
                  <small>From {invite.inviter_name}</small>
                </span>
                <span className={styles.actions}>
                  <form action={respondToRoomInvite}>
                    <input name="inviteId" type="hidden" value={invite.invite_id} />
                    <input name="roomId" type="hidden" value={invite.room_id} />
                    <input name="accept" type="hidden" value="true" />
                    <button className="primary-button" type="submit">
                      Join
                    </button>
                  </form>
                  <form action={respondToRoomInvite}>
                    <input name="inviteId" type="hidden" value={invite.invite_id} />
                    <input name="accept" type="hidden" value="false" />
                    <button className={styles.ghost} type="submit">
                      Decline
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.group}>
        <h2>Your active rooms</h2>
        {rooms.length === 0 ? (
          <p className={styles.empty}>
            You are not in any rooms yet. Create one above.
          </p>
        ) : (
          <ul className={styles.list}>
            {rooms.map((room) => (
              <li className={styles.row} key={room.id}>
                <span className={styles.name}>
                  {RULESET_LABELS[room.ruleset] ?? room.ruleset} room
                  {room.is_ranked ? (
                    <span className={styles.rankedBadge}>
                      Ranked · pot ◎{room.pot}
                    </span>
                  ) : null}
                  <small>
                    Code {room.invite_code} · up to {room.max_players} players ·{" "}
                    {describeTimer(room.turn_timer_seconds)}
                  </small>
                </span>
                <Link className={styles.ghost} href={`/rooms/${room.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
