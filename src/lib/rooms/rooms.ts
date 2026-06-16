import type { ValidationResult } from "@/lib/auth/validation";
import type { Ruleset } from "@/lib/ludo";

export type RoomStatus = "lobby" | "in_progress" | "completed" | "cancelled";
export type TurnTimer = 30 | 60 | 90 | null;

export interface Room {
  readonly id: string;
  readonly invite_code: string;
  readonly host_id: string;
  readonly ruleset: Ruleset;
  readonly max_players: number;
  readonly board_skin: string;
  readonly turn_timer_seconds: number | null;
  readonly status: RoomStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface RoomMember {
  readonly user_id: string;
  readonly seat: number;
  readonly display_name: string;
  readonly username: string | null;
  readonly is_host: boolean;
  readonly joined_at: string;
}

export const RULESETS: readonly Ruleset[] = ["classic", "nigerian"];
export const TURN_TIMER_OPTIONS: readonly TurnTimer[] = [null, 30, 60, 90];
const inviteCodePattern = /^[A-Z0-9]{6}$/;

export interface RoomSettings {
  readonly ruleset: Ruleset;
  readonly maxPlayers: number;
  readonly boardSkin: string;
  readonly turnTimerSeconds: TurnTimer;
}

/** Normalize and validate the invite code typed into the join form. */
export function validateInviteCode(
  data: FormData,
): ValidationResult<{ code: string }> {
  const raw = data.get("code");
  const code = (typeof raw === "string" ? raw : "").trim().toUpperCase();

  if (!inviteCodePattern.test(code)) {
    return { ok: false, message: "Enter a valid six-character invite code." };
  }

  return { ok: true, value: { code } };
}

function parseTimer(value: FormDataEntryValue | null): TurnTimer | undefined {
  if (value === null || value === "" || value === "none") return null;
  const parsed = Number(value);
  if (parsed === 30 || parsed === 60 || parsed === 90) return parsed;
  return undefined;
}

/** Validate the create/update room settings form. */
export function validateRoomSettings(
  data: FormData,
): ValidationResult<RoomSettings> {
  const ruleset = String(data.get("ruleset") ?? "");
  if (ruleset !== "classic" && ruleset !== "nigerian") {
    return { ok: false, message: "Choose Classic or Nigerian rules." };
  }

  const maxPlayers = Number(data.get("maxPlayers"));
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
    return { ok: false, message: "Rooms allow two to four players." };
  }

  const turnTimerSeconds = parseTimer(data.get("turnTimer"));
  if (turnTimerSeconds === undefined) {
    return { ok: false, message: "Turn timer must be off, 30, 60, or 90 seconds." };
  }

  const boardSkin = String(data.get("boardSkin") ?? "").trim() || "classic";

  return {
    ok: true,
    value: { ruleset, maxPlayers, boardSkin, turnTimerSeconds },
  };
}

/** Human-readable turn-timer label for lobby display. */
export function describeTimer(seconds: number | null): string {
  return seconds === null ? "No timer" : `${seconds}s per turn`;
}

/** True when the given user is the room host. */
export function isHost(room: Room, userId: string | null | undefined): boolean {
  return !!userId && room.host_id === userId;
}
