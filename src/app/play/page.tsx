import Link from "next/link";
import type { Metadata } from "next";

import { LocalMatch } from "@/components/ludo/local-match";
import { loadPlayerTheme } from "@/lib/cosmetics/theme";

export const metadata: Metadata = {
  title: "Play Ludo — Pass & play",
  description: "Play a local pass-the-phone Ludo match.",
};

export default async function PlayPage() {
  const theme = await loadPlayerTheme();

  return (
    <main
      className="app-shell"
      data-background={theme.background}
      data-reduced-motion={theme.reducedMotion ? "true" : undefined}
    >
      <header className="app-header">
        <span className="brand-mark" />
        <span className="brand-name">Ludo</span>
        <Link
          href="/"
          style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700 }}
        >
          Home
        </Link>
      </header>
      <LocalMatch
        backgroundSkin={theme.background}
        boardSkin={theme.board}
        diceSkin={theme.dice}
        tokenSkin={theme.token}
        animationSkin={theme.animation}
      />
    </main>
  );
}
