import type { Metadata } from "next";

import { StrategyBook } from "@/components/ludo/strategy-book";

export const metadata: Metadata = {
  title: "Strategy book — Ludo",
  description: "Equip the powers and ultimate you take into Extreme matches.",
};

export default function StrategyPage() {
  return (
    <section className="profile-card">
      <div>
        <p className="eyebrow">Extreme</p>
        <h1>Strategy book</h1>
        <p>
          Choose the powers your tiles can grant and the ultimate you take into
          Extreme matches. Your choices are saved for pass &amp; play.
        </p>
      </div>
      <StrategyBook />
    </section>
  );
}
