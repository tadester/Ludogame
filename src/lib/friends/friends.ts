import type { ValidationResult } from "@/lib/auth/validation";

export type FriendshipStatus = "pending" | "accepted";
export type FriendDirection = "accepted" | "incoming" | "outgoing";

/** A row as returned by the `list_friends` database function. */
export interface FriendRow {
  readonly friendship_id: string;
  readonly friend_id: string;
  readonly display_name: string;
  readonly username: string | null;
  readonly status: FriendshipStatus;
  readonly direction: FriendDirection;
  readonly created_at: string;
}

export interface GroupedFriends {
  readonly friends: readonly FriendRow[];
  readonly incoming: readonly FriendRow[];
  readonly outgoing: readonly FriendRow[];
}

const usernamePattern = /^[a-z0-9_]{3,24}$/;

/** Split the flat directory rows into accepted friends and pending requests. */
export function groupFriends(rows: readonly FriendRow[]): GroupedFriends {
  const friends: FriendRow[] = [];
  const incoming: FriendRow[] = [];
  const outgoing: FriendRow[] = [];

  for (const row of rows) {
    if (row.direction === "incoming") {
      incoming.push(row);
    } else if (row.direction === "outgoing") {
      outgoing.push(row);
    } else {
      friends.push(row);
    }
  }

  return { friends, incoming, outgoing };
}

/** Validate the username typed into the add-friend form. */
export function validateFriendUsername(
  data: FormData,
): ValidationResult<{ username: string }> {
  const raw = data.get("username");
  const username = (typeof raw === "string" ? raw : "").trim().toLowerCase();

  if (!username) {
    return { ok: false, message: "Enter a username to add a friend." };
  }

  if (!usernamePattern.test(username)) {
    return {
      ok: false,
      message:
        "Username must be 3-24 characters using only letters, numbers, or underscores.",
    };
  }

  return { ok: true, value: { username } };
}
