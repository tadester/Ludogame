"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getLegalActions } from "@/lib/ludo";
import type { MatchState } from "@/lib/ludo";
import { onlineViewModel } from "@/lib/ludo-online/view";
import { diceCountForRuleset, seatOwner } from "@/lib/ludo-online/authority";
import type { ServerIntent } from "@/lib/ludo-online/authority";
import { dieOrderOptions, legalMovesByToken } from "@/lib/ludo-ui/local-game";
import { getBoardLayout, moveWaypointsOn } from "@/lib/ludo-ui/geometry";
import type { Cell, PlayerColor } from "@/lib/ludo-ui/geometry";
import { createClient } from "@/lib/supabase/client";

import { ExtremePanel } from "./extreme-panel";
import { LudoBoard } from "./ludo-board";
import { MatchHud } from "./match-hud";
import styles from "./online-match.module.css";

const EMPTY = new Set<string>();
// Per-cell step time for the move walk — slow enough to follow, not sluggish.
const STEP_MS = 210;
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
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MatchState>(initial);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollingFaces, setRollingFaces] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Consecutive turns this client let the clock auto-play for the local user.
  const autoPlaysRef = useRef(0);
  // Step a moved token along its path (works for my own and opponents' moves).
  const [anim, setAnim] = useState<{ tokenId: string; cell: Cell } | null>(null);
  const prevProgressRef = useRef<Map<string, number | null>>(
    new Map(initial.tokens.map((token) => [token.id, token.progress])),
  );

  // Reset the auto-play streak whenever the local player acts on purpose.
  const markManualAction = useCallback(() => {
    autoPlaysRef.current = 0;
  }, []);

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
    // Pause so the roll is visible before the only move plays itself.
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
    }, 700);
    return () => window.clearTimeout(timer);
  }, [snapshot, userId, busy, send]);

  // Play the active player's best/forced move on their behalf when the clock
  // runs out so an idle (or briefly disconnected) seat never stalls the game.
  const autoPlay = useCallback(() => {
    const vm = onlineViewModel(snapshot, userId);
    if (!vm.isMyTurn) return;
    const actions = getLegalActions(snapshot);
    if (snapshot.phase === "awaiting-roll") {
      if (vm.canRoll) void send({ kind: "roll" });
      return;
    }
    if (snapshot.phase === "awaiting-die-order") {
      const option = dieOrderOptions(actions)[0];
      if (option) void send({ kind: "select-die-order", dieIds: option.dieIds });
      return;
    }
    if (snapshot.phase === "awaiting-move") {
      const [action] = [...legalMovesByToken(snapshot, actions).values()];
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
    }
  }, [snapshot, userId, send]);

  const turnTimerSeconds = snapshot.turnTimerSeconds ?? null;
  const timerActive =
    Boolean(turnTimerSeconds) &&
    snapshot.status === "active" &&
    !snapshot.winnerPlayerId;
  // A signature that changes every time the active seat faces a fresh decision,
  // so the countdown restarts on each roll/move prompt.
  const decisionKey = `${snapshot.turnNumber}:${snapshot.activePlayerIndex}:${
    snapshot.phase
  }:${snapshot.pendingRoll?.dice.map((d) => d.id).join(",") ?? ""}`;

  // Restart the countdown whenever a new decision arrives. Resetting during
  // render (rather than in an effect) keeps a stale "0" from briefly firing the
  // expiry logic before the next turn's clock is installed.
  const [trackedDecision, setTrackedDecision] = useState<string>("");
  if (trackedDecision !== decisionKey) {
    setTrackedDecision(decisionKey);
    setSecondsLeft(timerActive ? turnTimerSeconds : null);
  }

  // Tick the countdown down once per second.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((value) => (value === null ? null : value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  // When the clock hits zero on the local player's turn, auto-play for them —
  // and after ten straight auto-plays, drop them from the match.
  useEffect(() => {
    if (secondsLeft !== 0 || busy) return;
    const vm = onlineViewModel(snapshot, userId);
    if (
      !vm.isMyTurn ||
      snapshot.status !== "active" ||
      snapshot.winnerPlayerId
    ) {
      return;
    }
    autoPlaysRef.current += 1;
    if (autoPlaysRef.current >= 10) {
      router.push("/rooms?message=Removed+for+inactivity.");
      return;
    }
    autoPlay();
  }, [secondsLeft, busy, snapshot, userId, autoPlay, router]);

  // Detect the token that advanced between snapshots and walk it through its
  // path cells so moves are animated, not teleported. setState only happens in
  // timer callbacks, never synchronously in the effect body.
  useEffect(() => {
    const prev = prevProgressRef.current;
    let mover: {
      id: string;
      color: PlayerColor;
      from: number;
      to: number;
    } | null = null;
    for (const token of snapshot.tokens) {
      const before = prev.get(token.id);
      if (
        before !== undefined &&
        before !== null &&
        token.progress !== null &&
        token.progress > before
      ) {
        mover = {
          id: token.id,
          color: token.color,
          from: before,
          to: token.progress,
        };
        break;
      }
    }
    prevProgressRef.current = new Map(
      snapshot.tokens.map((token) => [token.id, token.progress]),
    );
    if (!mover) return;
    const layout = getBoardLayout(snapshot.ruleset);
    const waypoints = moveWaypointsOn(layout, mover.color, mover.from, mover.to);
    const moverId = mover.id;
    const timers: number[] = [];
    waypoints.forEach((cell, index) => {
      timers.push(
        window.setTimeout(() => {
          setAnim({ tokenId: moverId, cell });
          if (index === waypoints.length - 1) {
            timers.push(window.setTimeout(() => setAnim(null), STEP_MS));
          }
        }, index * STEP_MS),
      );
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [snapshot]);

  const view = onlineViewModel(snapshot, userId);
  const movable = new Set(view.movableTokenIds);

  const onTokenClick = (tokenId: string) => {
    if (busy || !view.isMyTurn) return;
    const action = legalMovesByToken(snapshot, getLegalActions(snapshot)).get(
      tokenId,
    );
    if (!action) return;
    markManualAction();
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
  const lastRoll = snapshot.lastRoll ?? null;
  // Prefer the live pending roll, then the local roll animation, then the last
  // persisted roll — so the dice never fall blank and everyone can see what the
  // last player rolled, even after the roll is consumed.
  const diceFaces =
    pendingDice.length > 0
      ? pendingDice.map((die) => die.value)
      : rollingFaces.length > 0
        ? rollingFaces
        : (lastRoll?.dice ?? []);
  const lastRoller = lastRoll
    ? (snapshot.players.find((player) => player.id === lastRoll.playerId) ??
      null)
    : null;
  const rollLabel =
    lastRoll && !rolling && pendingDice.length === 0
      ? `${
          seatOwner(lastRoll.playerId) === userId
            ? "You"
            : (lastRoller?.displayName ?? "Player")
        } rolled ${lastRoll.dice.join(" + ")}`
      : null;
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
        rollLabel={rollLabel}
        timerSeconds={secondsLeft}
        onRoll={() => {
          markManualAction();
          void send({ kind: "roll" });
        }}
      />

      <LudoBoard
        match={snapshot}
        movableTokenIds={view.isMyTurn ? movable : EMPTY}
        animatingTokenId={anim?.tokenId ?? null}
        animatingCell={anim?.cell ?? null}
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

      <ExtremePanel state={snapshot} userId={userId} />

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
                  onClick={() => {
                    markManualAction();
                    void send({
                      kind: "select-die-order",
                      dieIds: option.dieIds,
                    });
                  }}
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
