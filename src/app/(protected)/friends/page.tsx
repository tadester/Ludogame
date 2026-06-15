import { redirect } from "next/navigation";

import {
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/app/(protected)/friends/actions";
import { groupFriends } from "@/lib/friends/friends";
import type { FriendRow } from "@/lib/friends/friends";
import { createClient } from "@/lib/supabase/server";

import styles from "./friends.module.css";

type FriendsPageProps = {
  searchParams: Promise<{ message?: string }>;
};

function handle(row: FriendRow): string {
  return row.username ? `@${row.username}` : row.display_name;
}

export default async function FriendsPage({ searchParams }: FriendsPageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("list_friends");
  if (error) {
    throw new Error("Unable to load your friends.");
  }

  const { friends, incoming, outgoing } = groupFriends(
    (data ?? []) as FriendRow[],
  );
  const { message } = await searchParams;

  return (
    <section className={styles.page}>
      <div>
        <p className="eyebrow">Friends</p>
        <h1>Your circle</h1>
        <p>Add players by username, then invite them into private rooms.</p>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      <form action={sendFriendRequest} className={styles.addForm}>
        <label>
          <span>Add a friend by username</span>
          <input
            autoCapitalize="none"
            maxLength={24}
            minLength={3}
            name="username"
            pattern="[A-Za-z0-9_]+"
            placeholder="username"
            required
          />
        </label>
        <button className="primary-button" type="submit">
          Send request
        </button>
      </form>

      {incoming.length > 0 ? (
        <div className={styles.group}>
          <h2>Requests received</h2>
          <ul className={styles.list}>
            {incoming.map((row) => (
              <li className={styles.row} key={row.friendship_id}>
                <span className={styles.name}>
                  {row.display_name}
                  <small>{handle(row)}</small>
                </span>
                <span className={styles.actions}>
                  <form action={respondToFriendRequest}>
                    <input
                      name="requestId"
                      type="hidden"
                      value={row.friendship_id}
                    />
                    <input name="accept" type="hidden" value="true" />
                    <button className={styles.accept} type="submit">
                      Accept
                    </button>
                  </form>
                  <form action={respondToFriendRequest}>
                    <input
                      name="requestId"
                      type="hidden"
                      value={row.friendship_id}
                    />
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
        <h2>Friends</h2>
        {friends.length === 0 ? (
          <p className={styles.empty}>No friends yet. Send a request above.</p>
        ) : (
          <ul className={styles.list}>
            {friends.map((row) => (
              <li className={styles.row} key={row.friendship_id}>
                <span className={styles.name}>
                  {row.display_name}
                  <small>{handle(row)}</small>
                </span>
                <span className={styles.actions}>
                  <form action={removeFriend}>
                    <input name="friendId" type="hidden" value={row.friend_id} />
                    <button className={styles.ghost} type="submit">
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {outgoing.length > 0 ? (
        <div className={styles.group}>
          <h2>Requests sent</h2>
          <ul className={styles.list}>
            {outgoing.map((row) => (
              <li className={styles.row} key={row.friendship_id}>
                <span className={styles.name}>
                  {row.display_name}
                  <small>{handle(row)}</small>
                </span>
                <span className={styles.actions}>
                  <form action={removeFriend}>
                    <input name="friendId" type="hidden" value={row.friend_id} />
                    <button className={styles.ghost} type="submit">
                      Cancel
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
