import type { CosmeticKind } from "@/lib/cosmetics/cosmetics";

import styles from "./customize.module.css";

/** Two-stop gradients approximating each background/board skin, so the preview
 *  reads at a glance without duplicating the full multi-layer CSS. */
const GRADIENT: Record<string, string> = {
  // Backgrounds
  midnight: "linear-gradient(145deg, #102238, #07111f)",
  aurora: "linear-gradient(145deg, #2dd4bf, #6366f1)",
  sunset: "linear-gradient(145deg, #fb923c, #ef4444)",
  sakura: "linear-gradient(145deg, #ffb7ce, #2a1726)",
  shonen_dawn: "linear-gradient(145deg, #ffc45c, #e5484d)",
  night_city: "linear-gradient(145deg, #4593f7, #d633c7)",
  celestial: "linear-gradient(145deg, #5e54c8, #05040d)",
  hidden_leaf: "linear-gradient(145deg, #ffa84c, #2fa56c)",
  grand_line: "linear-gradient(145deg, #ffd66e, #06243f)",
  elite_classroom: "linear-gradient(145deg, #7896be, #0a121f)",
  cel_shaded: "linear-gradient(145deg, #3aa0ff, #14538f)",
  // Boards
  classic: "linear-gradient(145deg, #1b3350, #0d1c30)",
  emerald: "linear-gradient(145deg, #14402f, #06160f)",
  sakura_grove: "linear-gradient(145deg, #5a2a40, #2a1320)",
  neon_grid: "linear-gradient(145deg, #50dcff, #f472b6)",
  sumi_ink: "linear-gradient(145deg, #2b2b2b, #0d0d0d)",
  leaf_village: "linear-gradient(145deg, #2f4a22, #0a1a10)",
  pirate_seas: "linear-gradient(145deg, #0b4960, #041020)",
  advanced_class: "linear-gradient(145deg, #1f2c47, #0a121f)",
  manga_panel: "linear-gradient(145deg, #e8e8e8, #888888)",
};

const KIND_GLYPH: Record<CosmeticKind, string> = {
  background: "",
  board: "",
  dice: "",
  token: "",
  animation: "✨",
  sound: "🔊",
  effect: "🎆",
};

/** A compact visual preview of a cosmetic item for the inventory grid. */
export function CosmeticPreview({
  kind,
  code,
}: {
  kind: CosmeticKind;
  code: string;
}) {
  if (kind === "background" || kind === "board") {
    return (
      <span
        className={styles.preview}
        style={{ background: GRADIENT[code] ?? GRADIENT.midnight }}
        aria-hidden="true"
      />
    );
  }

  if (kind === "token") {
    return (
      <span className={styles.preview} aria-hidden="true">
        <span className={styles.tokenDots}>
          <span style={{ background: "var(--red)" }} />
          <span style={{ background: "var(--green)" }} />
          <span style={{ background: "var(--yellow)" }} />
          <span style={{ background: "var(--blue)" }} />
        </span>
      </span>
    );
  }

  if (kind === "dice") {
    return (
      <span className={`${styles.preview} ${styles.diePreview}`} aria-hidden="true">
        <span className={styles.diePip} />
      </span>
    );
  }

  return (
    <span className={`${styles.preview} ${styles.glyphPreview}`} aria-hidden="true">
      {KIND_GLYPH[kind]}
    </span>
  );
}
