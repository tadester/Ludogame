"use client";

import styles from "./dice.module.css";

const PIP_LAYOUT: Record<number, ReadonlySet<number>> = {
  1: new Set([4]),
  2: new Set([0, 8]),
  3: new Set([0, 4, 8]),
  4: new Set([0, 2, 6, 8]),
  5: new Set([0, 2, 4, 6, 8]),
  6: new Set([0, 2, 3, 5, 6, 8]),
};

interface DiceProps {
  value: number | null;
  rolling: boolean;
  ready: boolean;
  disabled: boolean;
  onRoll: () => void;
  skin?: string;
}

export function Dice({
  value,
  rolling,
  ready,
  disabled,
  onRoll,
  skin = "ivory",
}: DiceProps) {
  const pips = PIP_LAYOUT[value ?? 0] ?? new Set<number>();
  const classes = [
    styles.dice,
    ready ? styles.ready : "",
    rolling ? styles.rolling : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      data-dice-skin={skin}
      onClick={onRoll}
      disabled={disabled}
      aria-label={value ? `Dice showing ${value}. Roll again.` : "Roll dice"}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={pips.has(i) ? styles.pip : `${styles.pip} ${styles.empty}`}
        />
      ))}
    </button>
  );
}
