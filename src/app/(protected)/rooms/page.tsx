import Link from "next/link";
import { redirect } from "next/navigation";

import { createRoom, joinRoom } from "@/app/(protected)/rooms/actions";
import { RoomSettingsFields } from "@/app/(protected)/rooms/RoomSettingsFields";
import { describeTimer } from "@/lib/rooms/rooms";
import type { Room } from "@/lib/rooms/rooms";
import { createClient } from "@/lib/supabase/server";

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
          <RoomSettingsFields />
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
