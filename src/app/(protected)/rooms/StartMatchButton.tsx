"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ERRORS: Record<string, string> = {
  need_two_players: "You need at least two players to start.",
  forbidden: "Only the host can start the match.",
  room_not_found: "This room is no longer available.",
};

export function StartMatchButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/start`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        matchId?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.matchId) {
        setError(ERRORS[data?.error ?? ""] ?? "Unable to start the match.");
        return;
      }
      router.push(`/matches/${data.matchId}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="primary-button"
        disabled={busy}
        onClick={start}
        type="button"
      >
        {busy ? "Starting…" : "Start match"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
