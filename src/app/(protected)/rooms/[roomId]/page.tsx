import { redirect } from "next/navigation";

import {
  inviteFriendToRoom,
  leaveRoom,
  updateRoomSettings,
} from "@/app/(protected)/rooms/actions";
import { RoomSettingsFields } from "@/app/(protected)/rooms/RoomSettingsFields";
import { groupFriends } from "@/lib/friends/friends";
import type { FriendRow } from "@/lib/friends/friends";
import { describeTimer, isHost } from "@/lib/rooms/rooms";
import type { Room, RoomMember, TurnTimer } from "@/lib/rooms/rooms";
import { createClient } from "@/lib/supabase/server";

import styles from "../rooms.module.css";

type LobbyPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ message?: string }>;
};

const RULESET_LABELS: Record<string, string> = {
  classic: "Classic",
  nigerian: "Nigerian",
};

export default async function RoomLobbyPage({
  params,
  searchParams,
}: LobbyPageProps) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: roomData } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  const room = roomData as Room | null;
  if (!room) {
    redirect("/rooms?message=That+room+is+no+longer+available.");
  }

  const { data: memberData } = await supabase.rpc("list_room_members", {
    p_room_id: roomId,
  });
  const members = (memberData ?? []) as RoomMember[];

  const { data: friendData } = await supabase.rpc("list_friends");
  const { friends } = groupFriends((friendData ?? []) as FriendRow[]);
  const seated = new Set(members.map((m) => m.user_id));
  const invitableFriends = friends.filter((f) => !seated.has(f.friend_id));
  const roomFull = members.length >= room.max_players;

  const host = isHost(room, userId);
  const { message } = await searchParams;

  return (
    <section className={styles.page}>
      <div>
        <p className="eyebrow">Lobby</p>
        <h1>{RULESET_LABELS[room.ruleset] ?? room.ruleset} room</h1>
        <p>
          Share code <strong className={styles.code}>{room.invite_code}</strong>{" "}
          with friends to fill the remaining seats.
        </p>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.group}>
        <h2>
          Seats ({members.length}/{room.max_players})
        </h2>
        <ul className={styles.list}>
          {Array.from({ length: room.max_players }, (_, index) => {
            const seat = index + 1;
            const member = members.find((m) => m.seat === seat);
            return (
              <li className={styles.row} key={seat}>
                <span className={styles.name}>
                  Seat {seat}
                  <small>
                    {member
                      ? `${member.display_name}${member.is_host ? " · host" : ""}`
                      : "Open"}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {!roomFull && invitableFriends.length > 0 ? (
        <div className={styles.group}>
          <h2>Invite friends</h2>
          <ul className={styles.list}>
            {invitableFriends.map((friend) => (
              <li className={styles.row} key={friend.friend_id}>
                <span className={styles.name}>
                  {friend.display_name}
                  <small>
                    {friend.username ? `@${friend.username}` : "Friend"}
                  </small>
                </span>
                <form action={inviteFriendToRoom}>
                  <input name="roomId" type="hidden" value={room.id} />
                  <input name="friendId" type="hidden" value={friend.friend_id} />
                  <button className={styles.ghost} type="submit">
                    Invite
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {host ? (
        <form action={updateRoomSettings} className={styles.panel}>
          <h2>Host settings</h2>
          <input name="roomId" type="hidden" value={room.id} />
          <RoomSettingsFields
            boardSkin={room.board_skin}
            maxPlayers={room.max_players}
            ruleset={room.ruleset}
            turnTimer={room.turn_timer_seconds as TurnTimer}
          />
          <button className="primary-button" type="submit">
            Save settings
          </button>
        </form>
      ) : (
        <div className={styles.group}>
          <h2>Room settings</h2>
          <p className={styles.empty}>
            {RULESET_LABELS[room.ruleset] ?? room.ruleset} ·{" "}
            {describeTimer(room.turn_timer_seconds)} · up to {room.max_players}{" "}
            players
          </p>
        </div>
      )}

      <form action={leaveRoom}>
        <input name="roomId" type="hidden" value={room.id} />
        <button className={styles.ghost} type="submit">
          Leave room
        </button>
      </form>
    </section>
  );
}
