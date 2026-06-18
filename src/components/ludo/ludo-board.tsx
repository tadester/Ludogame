"use client";

import { useMemo } from "react";

import type { MatchState } from "@/lib/ludo";
import {
  HOME_LANE,
  PLAY_ORDER,
  RING_INDEX_TO_COLOR,
  RING_PATH,
  SAFE_RING_INDEXES,
  YARD_ORIGIN,
  cellForProgress,
  cellToPercent,
  tokenSlotIndex,
} from "@/lib/ludo-ui/geometry";
import type { Cell, PlayerColor } from "@/lib/ludo-ui/geometry";

import styles from "./ludo-board.module.css";

type Token = MatchState["tokens"][number];

const FILL: Record<PlayerColor, string> = {
  red: styles.fillRed,
  green: styles.fillGreen,
  yellow: styles.fillYellow,
  blue: styles.fillBlue,
};
const SOFT: Record<PlayerColor, string> = {
  red: styles.softRed,
  green: styles.softGreen,
  yellow: styles.softYellow,
  blue: styles.softBlue,
};
const DISC: Record<PlayerColor, string> = {
  red: styles.discRed,
  green: styles.discGreen,
  yellow: styles.discYellow,
  blue: styles.discBlue,
};
const TRI: Record<PlayerColor, string> = {
  red: styles.triRed,
  green: styles.triGreen,
  yellow: styles.triYellow,
  blue: styles.triBlue,
};

interface LudoBoardProps {
  match: MatchState;
  movableTokenIds: ReadonlySet<string>;
  animatingTokenId: string | null;
  animatingCell: Cell | null;
  capturedTokenIds: ReadonlySet<string>;
  interactive: boolean;
  onTokenClick: (tokenId: string) => void;
  boardSkin?: string;
  backgroundSkin?: string;
  tokenSkin?: string;
  animationSkin?: string;
  powerTileRingIndexes?: ReadonlySet<number>;
}

const NO_POWER_TILES: ReadonlySet<number> = new Set();

export function LudoBoard({
  match,
  movableTokenIds,
  animatingTokenId,
  animatingCell,
  capturedTokenIds,
  interactive,
  onTokenClick,
  boardSkin = "classic",
  backgroundSkin = "midnight",
  tokenSkin = "classic",
  animationSkin = "standard",
  powerTileRingIndexes = NO_POWER_TILES,
}: LudoBoardProps) {
  const placed = useMemo(
    () =>
      placeTokens(match.tokens, animatingTokenId, animatingCell),
    [match.tokens, animatingTokenId, animatingCell],
  );

  return (
    <div
      className={styles.boardWrap}
      data-background-skin={backgroundSkin}
      data-extreme={match.ruleset === "extreme" ? "true" : undefined}
    >
      <div className={styles.board} data-board-skin={boardSkin}>
        <div className={styles.grid}>
          {PLAY_ORDER.map((color) => (
            <Yard key={color} color={color} />
          ))}

          {RING_PATH.map((cell, ringIndex) => (
            <PathCell
              key={`ring-${ringIndex}`}
              cell={cell}
              ringIndex={ringIndex}
              isPowerTile={powerTileRingIndexes.has(ringIndex)}
            />
          ))}

          {PLAY_ORDER.flatMap((color) =>
            HOME_LANE[color].map((cell, i) => (
              <div
                key={`lane-${color}-${i}`}
                className={`${styles.cell} ${FILL[color]}`}
                style={cellStyle(cell)}
              />
            )),
          )}

          <div
            className={`${styles.cell} ${styles.center}`}
            style={{ gridRow: "7 / 10", gridColumn: "7 / 10" }}
          >
            {PLAY_ORDER.map((color) => (
              <span
                key={color}
                className={`${styles.tri} ${TRI[color]} ${FILL[color]}`}
              />
            ))}
          </div>
        </div>

        <div className={styles.tokenLayer}>
          <div
            className={styles.tokenInner}
            data-token-skin={tokenSkin}
            data-animation={animationSkin}
          >
            {placed.map(({ token, left, top }) => {
              const movable = movableTokenIds.has(token.id);
              const classes = [
                styles.token,
                movable ? styles.movable : "",
                interactive && movable ? styles.clickable : "",
              ]
                .filter(Boolean)
                .join(" ");
              const discClasses = [
                styles.disc,
                DISC[token.color],
                capturedTokenIds.has(token.id) ? styles.captured : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={token.id}
                  type="button"
                  className={classes}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  onClick={() => interactive && movable && onTokenClick(token.id)}
                  aria-label={`${token.color} token ${tokenSlotIndex(token.id) + 1}`}
                  disabled={!interactive || !movable}
                >
                  <span className={discClasses} data-team-color={token.color} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Yard({ color }: { color: PlayerColor }) {
  const [row, col] = YARD_ORIGIN[color];
  return (
    <div
      className={`${styles.yard} ${FILL[color]}`}
      style={{
        gridRow: `${row + 1} / ${row + 7}`,
        gridColumn: `${col + 1} / ${col + 7}`,
      }}
    >
      <div className={styles.yardInner}>
        {[0, 1, 2, 3].map((slot) => (
          <span key={slot} className={styles.homeSlot} />
        ))}
      </div>
    </div>
  );
}

function PathCell({
  cell,
  ringIndex,
  isPowerTile,
}: {
  cell: Cell;
  ringIndex: number;
  isPowerTile: boolean;
}) {
  const openingColor = RING_INDEX_TO_COLOR[ringIndex];
  const isSafe = SAFE_RING_INDEXES.has(ringIndex);
  const classes = [styles.cell, styles.pathCell];
  if (openingColor) {
    classes.push(SOFT[openingColor]);
  }
  return (
    <div className={classes.join(" ")} style={cellStyle(cell)}>
      {isPowerTile ? (
        <span className={styles.powerTile} aria-label="power tile">
          ✦
        </span>
      ) : !openingColor && isSafe ? (
        <span className={styles.safeStar}>★</span>
      ) : null}
    </div>
  );
}

function cellStyle(cell: Cell) {
  const [row, col] = cell;
  return { gridRow: row + 1, gridColumn: col + 1 } as const;
}

interface PlacedToken {
  token: Token;
  left: number;
  top: number;
}

/** Resolves every token to a board percentage, fanning out shared cells. */
function placeTokens(
  tokens: readonly Token[],
  animatingTokenId: string | null,
  animatingCell: Cell | null,
): PlacedToken[] {
  const resolved = tokens.map((token) => {
    const cell =
      token.id === animatingTokenId && animatingCell
        ? animatingCell
        : cellForProgress(
            token.color,
            token.progress,
            tokenSlotIndex(token.id),
          );
    return { token, cell };
  });

  const groups = new Map<string, Token[]>();
  for (const { token, cell } of resolved) {
    const key = `${Math.round(cell[0])},${Math.round(cell[1])}`;
    const list = groups.get(key) ?? [];
    list.push(token);
    groups.set(key, list);
  }

  return resolved.map(({ token, cell }) => {
    const base = cellToPercent(cell);
    if (token.id === animatingTokenId) {
      return { token, left: base.left, top: base.top };
    }
    const key = `${Math.round(cell[0])},${Math.round(cell[1])}`;
    const group = groups.get(key) ?? [token];
    if (group.length <= 1) {
      return { token, left: base.left, top: base.top };
    }
    const index = group.findIndex((entry) => entry.id === token.id);
    const angle = (index / group.length) * Math.PI * 2;
    const radius = 1.7;
    return {
      token,
      left: base.left + Math.cos(angle) * radius,
      top: base.top + Math.sin(angle) * radius,
    };
  });
}
