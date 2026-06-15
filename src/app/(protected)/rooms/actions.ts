"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateInviteCode, validateRoomSettings } from "@/lib/rooms/rooms";
import { createClient } from "@/lib/supabase/server";

function roomsRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/rooms?${params.toString()}`);
}

function lobbyRedirect(roomId: string, message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/rooms/${roomId}?${params.toString()}`);
}

function friendlyJoinError(message: string): string {
  if (message.includes("not found")) {
    return "No room found with that invite code.";
  }
  if (message.includes("full")) {
    return "That room is already full.";
  }
  if (message.includes("no longer open")) {
    return "That room is no longer open to join.";
  }
  return "Unable to join that room. Try again.";
}

function friendlySettingsError(message: string): string {
  if (message.includes("below the current member count")) {
    return "Lower the player count only after some players leave.";
  }
  if (message.includes("only the host")) {
    return "Only the host can change room settings.";
  }
  if (message.includes("locked")) {
    return "Settings are locked once the match starts.";
  }
  return "Unable to save room settings. Try again.";
}

async function requireClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/login");
  }
  return supabase;
}

export async function createRoom(formData: FormData) {
  const result = validateRoomSettings(formData);
  if (!result.ok) {
    roomsRedirect(result.message);
  }

  const supabase = await requireClient();
  const { data, error } = await supabase
    .rpc("create_room", {
      p_ruleset: result.value.ruleset,
      p_max_players: result.value.maxPlayers,
      p_board_skin: result.value.boardSkin,
      p_turn_timer_seconds: result.value.turnTimerSeconds,
    })
    .single<{ id: string }>();

  if (error || !data) {
    roomsRedirect("Unable to create a room right now. Try again.");
  }

  redirect(`/rooms/${data.id}`);
}

export async function joinRoom(formData: FormData) {
  const result = validateInviteCode(formData);
  if (!result.ok) {
    roomsRedirect(result.message);
  }

  const supabase = await requireClient();
  const { data, error } = await supabase
    .rpc("join_room", { p_invite_code: result.value.code })
    .single<{ room_id: string }>();

  if (error || !data) {
    roomsRedirect(friendlyJoinError(error?.message ?? ""));
  }

  redirect(`/rooms/${data.room_id}`);
}

export async function leaveRoom(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  const supabase = await requireClient();
  if (roomId) {
    await supabase.rpc("leave_room", { p_room_id: roomId });
  }
  roomsRedirect("You left the room.");
}

export async function updateRoomSettings(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  const result = validateRoomSettings(formData);
  if (!result.ok) {
    lobbyRedirect(roomId, result.message);
  }

  const supabase = await requireClient();
  const { error } = await supabase.rpc("update_room_settings", {
    p_room_id: roomId,
    p_ruleset: result.value.ruleset,
    p_max_players: result.value.maxPlayers,
    p_board_skin: result.value.boardSkin,
    p_turn_timer_seconds: result.value.turnTimerSeconds,
  });

  if (error) {
    lobbyRedirect(roomId, friendlySettingsError(error.message));
  }

  revalidatePath(`/rooms/${roomId}`);
  lobbyRedirect(roomId, "Room settings saved.");
}
