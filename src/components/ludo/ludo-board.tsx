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

const TOKEN_SKIN_MARK: Record<string, string> = {
  gem: "◆",
  star: "★",
  crystal: "◇",
  ninja: "N",
  straw_hat: "H",
  class_point: "CP",
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
              isSafe={
                safeRingIndexes
                  ? safeRingIndexes.has(ringIndex)
                  : SAFE_RING_INDEXES.has(ringIndex)
              }
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
              "--token-size": `${(100 / layout.size) * 1.4}%`,
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
                  data-token-skin={tokenSkin}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  onClick={() => interactive && movable && onTokenClick(token.id)}
                  aria-label={`${token.color} token ${tokenSlotIndex(token.id) + 1}`}
                  disabled={!interactive || !movable}
                >
                  <span className={discClasses} data-team-color={token.color}>
                    {TOKEN_SKIN_MARK[tokenSkin] ? (
                      <>
                        <span className={styles.skinShape} data-token-skin-shape />
                        <span
                          className={styles.teamOverlay}
                          data-token-team-overlay
                        />
                      </>
                    ) : null}
                    {TOKEN_SKIN_MARK[tokenSkin] ? (
                      <span className={styles.skinMark} data-token-skin-mark>
                        {TOKEN_SKIN_MARK[tokenSkin]}
                      </span>
                    ) : null}
                  </span>
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
}

/** Resolves every token to a board percentage, fanning out shared cells. */
function placeTokens(
  layout: BoardLayout,
  tokens: readonly Token[],
  animatingTokenId: string | null,
  animatingCell: Cell | null,
): PlacedToken[] {
  const resolved = tokens.map((token) => {
    const cell =
      token.id === animatingTokenId && animatingCell
        ? animatingCell
        : cellForProgressOn(
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
    const radius = Math.min(3.1, 1.45 + group.length * 0.22);
    return {
      token,
      left: base.left + Math.cos(angle) * radius,
      top: base.top + Math.sin(angle) * radius,
    };
  });
}
