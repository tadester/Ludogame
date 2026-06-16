"use client";

import { useCallback, useEffect, useState } from "react";

import { getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { onlineViewModel } from "@/lib/ludo-online/view";
import type { ServerIntent } from "@/lib/ludo-online/authority";
import { legalMovesByToken } from "@/lib/ludo-ui/local-game";
import { createClient } from "@/lib/supabase/client";

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";
import styles from "./online-match.module.css";

const EMPTY = new Set<string>();

interface OnlineMatchProps {
  readonly matchId: string;
  readonly userId: string;
  readonly initial: MatchState;
  readonly boardSkin?: string;
  readonly tokenSkin?: string;
  readonly diceSkin?: string;
}

export function OnlineMatch({
  matchId,
  userId,
  initial,
  boardSkin = "classic",
  tokenSkin = "classic",
  diceSkin = "ivory",
}: OnlineMatchProps) {
  const [snapshot, setSnapshot] = useState<MatchState>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resync = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("matches")
      .select("snapshot")
      .eq("id", matchId)
      .maybeSingle<{ snapshot: MatchState }>();
    if (data?.snapshot) setSnapshot(data.snapshot);
  }, [matchId]);

  // Stream authoritative snapshot updates from the server via Realtime.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const next = (payload.new as { snapshot?: MatchState }).snapshot;
          if (next) setSnapshot(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  const send = useCallback(
    async (intent: ServerIntent) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/intent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intent }),
        });
        if (res.status === 409) {
          await resync();
          setMessage("That move was out of date — board refreshed.");
          return;
        }
        if (res.status === 403) {
          setMessage("It is not your turn.");
          return;
        }
        if (res.status === 422) {
          setMessage("That move is not legal.");
          return;
        }
        if (!res.ok) {
          setMessage("Something went wrong. Try again.");
          return;
        }
        const data = (await res.json()) as { snapshot?: MatchState };
        if (data.snapshot) setSnapshot(data.snapshot);
      } catch {
        setMessage("Network error. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [matchId, resync],
  );

  const view = onlineViewModel(snapshot, userId);
  const movable = new Set(view.movableTokenIds);

  const onTokenClick = (tokenId: string) => {
    if (busy || !view.isMyTurn) return;
    const action = legalMovesByToken(snapshot, getLegalActions(snapshot)).get(
      tokenId,
    );
    if (!action) return;
    if (action.type === "release-token") {
      void send({
        kind: "release-token",
        tokenId: action.tokenId,
        dieId: action.dieId,
      });
    } else if (action.type === "move-token") {
      void send({
        kind: "move-token",
        tokenId: action.tokenId,
        dieIds: action.dieIds,
      });
    }
  };

  const pendingDice = snapshot.pendingRoll?.dice ?? [];

  return (
    <section className={styles.match}>
      <header className={styles.status} role="status">
        {view.winnerName
          ? `${view.winnerName} wins!`
          : view.isMyTurn
            ? "Your turn"
            : `Waiting for ${view.activeName}…`}
      </header>

      <LudoBoard
        match={snapshot}
        movableTokenIds={view.isMyTurn ? movable : EMPTY}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={EMPTY}
        interactive={view.isMyTurn && !busy}
        onTokenClick={onTokenClick}
        boardSkin={boardSkin}
        tokenSkin={tokenSkin}
      />

      {message ? <p className={styles.message}>{message}</p> : null}

      {!view.winnerName && view.isMyTurn ? (
        <div className={styles.controls}>
          {view.canRoll ? (
            <Dice
              value={pendingDice[0]?.value ?? null}
              rolling={false}
              ready={!busy}
              disabled={busy}
              skin={diceSkin}
              onRoll={() => void send({ kind: "roll" })}
            />
          ) : view.phase === "awaiting-die-order" ? (
            <div className={styles.dieOrders}>
              {view.dieOrderOptions.map((option) => (
                <button
                  className={styles.orderButton}
                  disabled={busy}
                  key={option.dieIds.join("-")}
                  onClick={() =>
                    void send({
                      kind: "select-die-order",
                      dieIds: option.dieIds,
                    })
                  }
                  type="button"
                >
                  {option.dieIds
                    .map(
                      (id) =>
                        pendingDice.find((d) => d.id === id)?.value ?? "?",
                    )
                    .join(" then ")}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.hint}>
              Tap a highlighted token to move it
              {pendingDice.length > 0
                ? ` (${pendingDice.map((d) => d.value).join(", ")})`
                : ""}
              .
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
