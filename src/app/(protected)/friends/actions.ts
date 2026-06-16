"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateFriendUsername } from "@/lib/friends/friends";
import { createClient } from "@/lib/supabase/server";

function friendsRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/friends?${params.toString()}`);
}

/** Map a database error message to user-facing copy. */
function friendlyRequestError(message: string): string {
  if (message.includes("already friends")) {
    return "You are already friends with that player.";
  }
  if (message.includes("already pending")) {
    return "There is already a pending request with that player.";
  }
  if (message.includes("yourself")) {
    return "You cannot add yourself as a friend.";
  }
  return "Unable to send the friend request. Try again.";
}

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }
  return supabase;
}

export async function sendFriendRequest(formData: FormData) {
  const result = validateFriendUsername(formData);
  if (!result.ok) {
    friendsRedirect(result.message);
  }

  const supabase = await requireUserId();

  const { data: profile, error: lookupError } = await supabase
    .rpc("find_profile_by_username", { p_username: result.value.username })
    .maybeSingle<{ id: string }>();

  if (lookupError) {
    friendsRedirect("Unable to search for that player right now. Try again.");
  }
  if (!profile) {
    friendsRedirect(`No player found with username "${result.value.username}".`);
  }

  const { error } = await supabase.rpc("send_friend_request", {
    p_addressee: profile.id,
  });
  if (error) {
    friendsRedirect(friendlyRequestError(error.message));
  }

  revalidatePath("/friends");
  friendsRedirect("Friend request sent.");
}

export async function respondToFriendRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";

  if (!requestId) {
    friendsRedirect("That request is no longer available.");
  }

  const supabase = await requireUserId();
  const { error } = await supabase.rpc("respond_to_friend_request", {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) {
    friendsRedirect("Unable to update that request. Try again.");
  }

  revalidatePath("/friends");
  friendsRedirect(accept ? "Friend request accepted." : "Friend request declined.");
}

export async function removeFriend(formData: FormData) {
  const friendId = String(formData.get("friendId") ?? "");
  if (!friendId) {
    friendsRedirect("That friend is no longer available.");
  }

  const supabase = await requireUserId();
  const { error } = await supabase.rpc("remove_friend", { p_other: friendId });
  if (error) {
    friendsRedirect("Unable to remove that friend. Try again.");
  }

  revalidatePath("/friends");
  friendsRedirect("Removed.");
}
