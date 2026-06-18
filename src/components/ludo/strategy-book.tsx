"use client";

import { useCallback, useEffect, useState } from "react";

import type { PowerKind, UltimateKind } from "@/lib/ludo";
import { loadPreferences, savePreferences } from "@/lib/ludo-ui/local-storage";
import {
  POWER_DESC,
  POWER_LABEL,
  POWER_ORDER,
  STRATEGY_BOOK_CAP,
  ULTIMATE_DESC,
  ULTIMATE_LABEL,
  ULTIMATE_ORDER,
} from "@/lib/ludo-ui/powers-meta";

import styles from "./strategy-book.module.css";

/**
 * Editor for the Extreme strategy book: the powers a player equips (up to five,
 * which their tiles can grant) and the single ultimate they take into a match.
 * Self-contained — it reads and writes the saved local preferences, so it can
 * live on its own page or anywhere else.
 */
export function StrategyBook() {
  const [loadout, setLoadout] = useState<PowerKind[]>([]);
  const [ultimate, setUltimate] = useState<UltimateKind>("meteor");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const prefs = loadPreferences();
    if (prefs?.loadout) setLoadout([...prefs.loadout]);
    if (prefs?.ultimate) setUltimate(prefs.ultimate);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback(
    (nextLoadout: PowerKind[], nextUltimate: UltimateKind) => {
      const prefs = loadPreferences();
      // Preserve existing match preferences; only update the book and ultimate.
      // Fall back to the play screen's own defaults when nothing is saved yet.
      savePreferences({
        count: prefs?.count ?? 2,
        ruleset: prefs?.ruleset ?? "classic",
        names: prefs?.names ?? [],
        loadout: nextLoadout,
        ultimate: nextUltimate,
      });
    },
    [],
  );

  const togglePower = useCallback(
    (power: PowerKind) => {
      setLoadout((prev) => {
        const next = prev.includes(power)
          ? prev.filter((p) => p !== power)
          : prev.length >= STRATEGY_BOOK_CAP
            ? prev
            : [...prev, power];
        persist(next, ultimate);
        return next;
      });
    },
    [persist, ultimate],
  );

  const chooseUltimate = useCallback(
    (kind: UltimateKind) => {
      setUltimate(kind);
      persist(loadout, kind);
    },
    [persist, loadout],
  );

  return (
    <div className={styles.book}>
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Powers</h2>
          <span className={styles.count}>
            {loadout.length}/{STRATEGY_BOOK_CAP} equipped
          </span>
        </header>
        <p className={styles.hint}>
          Equip up to five powers. In Extreme, a ✦ power tile grants a random
          one from your equipped set. Leave empty to use each tile&apos;s own
          power.
        </p>
        <ul className={styles.list}>
          {POWER_ORDER.map((power) => {
            const equipped = loadout.includes(power);
            const full = !equipped && loadout.length >= STRATEGY_BOOK_CAP;
            return (
              <li key={power}>
                <button
                  type="button"
                  className={`${styles.row} ${equipped ? styles.equipped : ""}`}
                  aria-pressed={equipped}
                  disabled={full}
                  onClick={() => togglePower(power)}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.name}>{POWER_LABEL[power]}</span>
                    <span className={styles.desc}>{POWER_DESC[power]}</span>
                  </span>
                  <span className={styles.state}>
                    {equipped ? "✓ Equipped" : full ? "Full" : "Equip"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Ultimate</h2>
          <span className={styles.count}>{ULTIMATE_LABEL[ultimate]}</span>
        </header>
        <p className={styles.hint}>
          Everyone equips one ultimate. It charges as you play, then can be
          unleashed — some are limited, the defensive one recharges.
        </p>
        <ul className={styles.list}>
          {ULTIMATE_ORDER.map((kind) => {
            const equipped = ultimate === kind;
            return (
              <li key={kind}>
                <button
                  type="button"
                  className={`${styles.row} ${equipped ? styles.equipped : ""}`}
                  aria-pressed={equipped}
                  onClick={() => chooseUltimate(kind)}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.name}>{ULTIMATE_LABEL[kind]}</span>
                    <span className={styles.desc}>{ULTIMATE_DESC[kind]}</span>
                  </span>
                  <span className={styles.state}>
                    {equipped ? "✓ Equipped" : "Equip"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
