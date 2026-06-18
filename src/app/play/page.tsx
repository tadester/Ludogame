import Link from "next/link";
import type { Metadata } from "next";

import { LocalMatch } from "@/components/ludo/local-match";

export const metadata: Metadata = {
  title: "Play Ludo — Pass & play",
  description: "Play a local pass-the-phone Ludo match.",
};

export default function PlayPage() {
  return (
    <main className="app-shell" data-background="mikayla">
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
      <LocalMatch />
    </main>
  );
}
