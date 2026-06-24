"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

import type { MatchState } from "@/lib/ludo";
import type { BoardLayout } from "@/lib/ludo-ui/board-layout";
import {
  PLAY_ORDER,
  SAFE_RING_INDEXES,
  cellForProgressOn,
  cellToPercentOn,
  getBoardLayout,
  ringIndexToColor,
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
const TRI: Record<PlayerColor, string> = {
  red: styles.triRed,
  green: styles.triGreen,
  yellow: styles.triYellow,
  blue: styles.triBlue,
};
const TOKEN_SEAT_COLOR: Record<PlayerColor, string> = {
  red: "#ef233c",
  green: "#16a34a",
  yellow: "#facc15",
  blue: "#1683e7",
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
  safeRingIndexes?: ReadonlySet<number>;
}

const NO_POWER_TILES: ReadonlySet<number> = new Set();
const NO_SAFE_TILES: ReadonlySet<number> = new Set();

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
  safeRingIndexes,
}: LudoBoardProps) {
  const layout = getBoardLayout(match.ruleset);
  const openingColors = useMemo(() => ringIndexToColor(layout), [layout]);
  // Nigerian rules have no safe squares, so never draw safe stars there.
  const effectiveSafe =
    match.ruleset === "nigerian"
      ? NO_SAFE_TILES
      : (safeRingIndexes ?? SAFE_RING_INDEXES);
  const mid = (layout.size - 1) / 2;
  const placed = useMemo(
    () => placeTokens(layout, match.tokens, animatingTokenId, animatingCell),
    [layout, match.tokens, animatingTokenId, animatingCell],
  );

  return (
    <div
      className={styles.boardWrap}
      data-background-skin={backgroundSkin}
      data-extreme={match.ruleset === "extreme" ? "true" : undefined}
    >
      <div className={styles.board} data-board-skin={boardSkin}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${layout.size}, 1fr)`,
            gridTemplateRows: `repeat(${layout.size}, 1fr)`,
          }}
        >
          {PLAY_ORDER.map((color) => (
            <Yard key={color} color={color} layout={layout} />
          ))}

          {layout.ringPath.map((cell, ringIndex) => (
            <PathCell
              key={`ring-${ringIndex}`}
              cell={cell}
              openingColor={openingColors[ringIndex]}
              isPowerTile={powerTileRingIndexes.has(ringIndex)}
              isSafe={effectiveSafe.has(ringIndex)}
            />
          ))}

          {PLAY_ORDER.flatMap((color) =>
            layout.homeLane[color].map((cell, i) => (
              <div
                key={`lane-${color}-${i}`}
                className={`${styles.cell} ${FILL[color]}`}
                style={cellStyle(cell)}
              />
            )),
          )}

          <div
            className={`${styles.cell} ${styles.center}`}
            style={{
              gridRow: `${mid} / ${mid + 3}`,
              gridColumn: `${mid} / ${mid + 3}`,
            }}
          >
            {PLAY_ORDER.map((color) => (
              <span
                key={color}
                className={`${styles.tri} ${TRI[color]} ${FILL[color]}`}
              />
            ))}
          </div>
        </div>

        <div
          className={styles.tokenLayer}
          style={
            {
              "--token-size": `${(100 / layout.size) * 1.12}%`,
            } as CSSProperties
          }
        >
          {/* Rest pads under each yard slot so tokens sit on clear spots. */}
          {PLAY_ORDER.flatMap((color) =>
            layout.yardSlots[color].map((cell, slot) => {
              const { left, top } = cellToPercentOn(layout, cell);
              return (
                <span
                  key={`pad-${color}-${slot}`}
                  className={styles.yardPad}
                  style={{ left: `${left}%`, top: `${top}%` }}
                />
              );
            }),
          )}
          <div
            className={styles.tokenInner}
            data-token-skin={tokenSkin}
            data-animation={animationSkin}
          >
            {placed.map(({ token, left, top, won }) => {
              const movable = movableTokenIds.has(token.id);
              const btnClasses = [
                styles.gToken,
                movable ? styles.gMovable : "",
                interactive && movable ? styles.gClickable : "",
                won ? styles.gWon : "",
              ]
                .filter(Boolean)
                .join(" ");
              const pieceClasses = [
                styles.gPiece,
                capturedTokenIds.has(token.id) ? styles.gCaptured : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={token.id}
                  type="button"
                  className={btnClasses}
                  data-token-skin={tokenSkin}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  onClick={() => interactive && movable && onTokenClick(token.id)}
                  aria-label={`${token.color} token ${tokenSlotIndex(token.id) + 1}`}
                  disabled={!interactive || !movable}
                >
                  <span
                    className={pieceClasses}
                    data-team-color={token.color}
                    data-token-skin={tokenSkin}
                    style={
                      { "--tc": TOKEN_SEAT_COLOR[token.color] } as CSSProperties
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Yard({ color, layout }: { color: PlayerColor; layout: BoardLayout }) {
  const [row, col] = layout.yardOrigin[color];
  const block = (layout.size - 1) / 2 - 1;
  return (
    <div
      className={`${styles.yard} ${FILL[color]}`}
      style={{
        gridRow: `${row + 1} / ${row + 1 + block}`,
        gridColumn: `${col + 1} / ${col + 1 + block}`,
      }}
    >
      <div className={styles.yardWell} />
    </div>
  );
}

function PathCell({
  cell,
  openingColor,
  isPowerTile,
  isSafe,
}: {
  cell: Cell;
  openingColor: PlayerColor | undefined;
  isPowerTile: boolean;
  isSafe: boolean;
}) {
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
        <span className={styles.safeStar} aria-label="safe zone">
          ★
        </span>
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
  won: boolean;
}

/** Resolves every token to a board percentage, fanning out shared cells. */
function placeTokens(
  layout: BoardLayout,
  tokens: readonly Token[],
  animatingTokenId: string | null,
  animatingCell: Cell | null,
): PlacedToken[] {
  // Finished tokens come to rest in their own colour's home lane (closest to
  // the centre first) instead of piling onto the shared centre triangle.
  const wonSeen: Record<string, number> = {};
  const resolved = tokens.map((token) => {
    if (token.id === animatingTokenId && animatingCell) {
      return { token, cell: animatingCell };
    }
    if (token.status === "won") {
      const lane = layout.homeLane[token.color];
      const order = wonSeen[token.color] ?? 0;
      wonSeen[token.color] = order + 1;
      const cell = lane[lane.length - 1 - order] ?? layout.center;
      return { token, cell };
    }
    const cell = cellForProgressOn(
      layout,
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
    const base = cellToPercentOn(layout, cell);
    const won = token.status === "won";
    if (token.id === animatingTokenId) {
      return { token, left: base.left, top: base.top, won };
    }
    const key = `${Math.round(cell[0])},${Math.round(cell[1])}`;
    const group = groups.get(key) ?? [token];
    if (group.length <= 1) {
      return { token, left: base.left, top: base.top, won };
    }
    const index = group.findIndex((entry) => entry.id === token.id);
    const angle = (index / group.length) * Math.PI * 2;
    const radius = Math.min(3.1, 1.45 + group.length * 0.22);
    return {
      token,
      left: base.left + Math.cos(angle) * radius,
      top: base.top + Math.sin(angle) * radius,
      won,
    };
  });
}
