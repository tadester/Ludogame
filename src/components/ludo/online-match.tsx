"use client";

import { useCallback, useEffect, useState } from "react";

import { getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { onlineViewModel } from "@/lib/ludo-online/view";
import { diceCountForRuleset, seatOwner } from "@/lib/ludo-online/authority";
import type { ServerIntent } from "@/lib/ludo-online/authority";
import { legalMovesByToken } from "@/lib/ludo-ui/local-game";
import { createClient } from "@/lib/supabase/client";

import { LudoBoard } from "./ludo-board";
import { MatchHud } from "./match-hud";
import styles from "./online-match.module.css";

const EMPTY = new Set<string>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface OnlineMatchProps {
  readonly matchId: string;
  readonly userId: string;
  readonly initial: MatchState;
  readonly boardSkin?: string;
  readonly backgroundSkin?: string;
  readonly tokenSkin?: string;
  readonly diceSkin?: string;
  readonly animationSkin?: string;
  readonly effectSkin?: string;
}

export function OnlineMatch({
  matchId,
  userId,
  initial,
  boardSkin = "classic",
  backgroundSkin = "midnight",
  tokenSkin = "classic",
  diceSkin = "ivory",
  animationSkin = "standard",
  effectSkin = "none",
}: OnlineMatchProps) {
  const [snapshot, setSnapshot] = useState<MatchState>(initial);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollingFaces, setRollingFaces] = useState<number[]>([]);
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

  // Realtime can miss updates (RLS/socket auth, backgrounded tabs), so also
  // poll for the authoritative snapshot and resync when the tab regains focus,
  // so opponents' moves always appear without a manual refresh.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!busy) void resync();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !busy) void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [busy, resync]);

  const send = useCallback(
    async (intent: ServerIntent) => {
      setBusy(true);
      if (intent.kind === "roll") {
        const diceCount = diceCountForRuleset(snapshot.ruleset);
        setRolling(true);
        for (let i = 0; i < 9; i += 1) {
          setRollingFaces(
            Array.from({ length: diceCount }, (_, index) => ((i + index) % 6) + 1),
          );
          await sleep(55);
        }
      }
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
        if (data.snapshot) {
          setSnapshot(data.snapshot);
          setRollingFaces(data.snapshot.pendingRoll?.dice.map((d) => d.value) ?? []);
        }
      } catch {
        setMessage("Network error. Try again.");
      } finally {
        setBusy(false);
        setRolling(false);
      }
    },
    [matchId, resync, snapshot.ruleset],
  );

  // With exactly one legal move on your turn, play it automatically.
  useEffect(() => {
    if (busy) return;
    const vm = onlineViewModel(snapshot, userId);
    if (!vm.isMyTurn || snapshot.phase !== "awaiting-move") return;
    const moves = legalMovesByToken(snapshot, getLegalActions(snapshot));
    if (moves.size !== 1) return;
    const [action] = [...moves.values()];
    const timer = window.setTimeout(() => {
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
    }, 350);
    return () => window.clearTimeout(timer);
  }, [snapshot, userId, busy, send]);

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
  const diceCount = diceCountForRuleset(snapshot.ruleset);
  const diceFaces =
    pendingDice.length > 0 ? pendingDice.map((die) => die.value) : rollingFaces;
  const activePlayer = snapshot.players[snapshot.activePlayerIndex] ?? null;
  const currentPlayer =
    snapshot.players.find((player) => seatOwner(player.id) === userId) ?? null;
  const status = view.winnerName
    ? `${view.winnerName} wins!`
    : view.isMyTurn
      ? view.canRoll
        ? "Your turn — roll the dice."
        : view.phase === "awaiting-die-order"
          ? "Choose the dice order."
          : `Tap a highlighted token to move${
              pendingDice.length > 0
                ? ` (${pendingDice.map((d) => d.value).join(", ")})`
                : ""
            }.`
      : `Waiting for ${view.activeName}…`;

  return (
    <section className={styles.match} data-background-skin={backgroundSkin}>
      <MatchHud
        activePlayer={activePlayer}
        currentPlayer={currentPlayer}
        players={snapshot.players}
        tokens={snapshot.tokens}
        status={message ?? status}
        diceCount={diceCount}
        diceFaces={diceFaces}
        rolling={rolling}
        canRoll={view.isMyTurn && view.canRoll && !busy}
        diceSkin={diceSkin}
        animationSkin={animationSkin}
        timerSeconds={snapshot.turnTimerSeconds ?? null}
        onRoll={() => void send({ kind: "roll" })}
      />

      <LudoBoard
        match={snapshot}
        movableTokenIds={view.isMyTurn ? movable : EMPTY}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={EMPTY}
        interactive={view.isMyTurn && !busy}
        onTokenClick={onTokenClick}
        boardSkin={boardSkin}
        backgroundSkin={backgroundSkin}
        tokenSkin={tokenSkin}
        animationSkin={animationSkin}
        powerTileRingIndexes={
          snapshot.powerUps
            ? new Set(snapshot.powerUps.tiles.map((t) => t.ringIndex))
            : undefined
        }
        safeRingIndexes={
          snapshot.powerUps?.safeRingIndexes
            ? new Set(snapshot.powerUps.safeRingIndexes)
            : undefined
        }
      />

      {view.winnerName && effectSkin !== "none" ? (
        <div aria-hidden="true" className={styles.winEffect} data-effect={effectSkin}>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={styles.spark} />
          ))}
        </div>
      ) : null}

      {!view.winnerName && view.isMyTurn ? (
        <div className={styles.controls}>
          {view.phase === "awaiting-die-order" ? (
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
          ) : !view.canRoll ? (
            <p className={styles.hint}>
              Tap a highlighted token to move it
              {pendingDice.length > 0
                ? ` (${pendingDice.map((d) => d.value).join(", ")})`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
