import { redirect } from "next/navigation";

import {
  equipCosmetic,
  updatePreferences,
} from "@/app/(protected)/customize/actions";
import {
  equippedItemId,
  groupByKind,
  KIND_LABELS,
} from "@/lib/cosmetics/cosmetics";
import type { CosmeticItem, PlayerCosmetics } from "@/lib/cosmetics/cosmetics";
import { createClient } from "@/lib/supabase/server";

import styles from "./customize.module.css";

type CustomizePageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function CustomizePage({
  searchParams,
}: CustomizePageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const [{ data: catalog, error }, { data: loadoutData }] = await Promise.all([
    supabase.rpc("list_cosmetics"),
    supabase.rpc("get_player_cosmetics"),
  ]);
  if (error) {
    throw new Error("Unable to load the cosmetics catalog.");
  }

  const groups = groupByKind((catalog ?? []) as CosmeticItem[]);
  const loadout = (loadoutData ?? null) as PlayerCosmetics | null;
  const { message } = await searchParams;

  return (
    <section className={styles.page}>
      <div>
        <p className="eyebrow">Customize</p>
        <h1>Make the board yours</h1>
        <p>Equip what you own. Cosmetics never change how the game plays.</p>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      <form action={updatePreferences} className={styles.prefs}>
        <h2>Accessibility</h2>
        <label className={styles.toggle}>
          <input
            defaultChecked={loadout?.reduced_motion ?? false}
            name="reducedMotion"
            type="checkbox"
          />
          <span>Reduce motion</span>
        </label>
        <label className={styles.toggle}>
          <input
            defaultChecked={loadout?.muted_audio ?? false}
            name="mutedAudio"
            type="checkbox"
          />
          <span>Mute audio</span>
        </label>
        <button className="primary-button" type="submit">
          Save preferences
        </button>
      </form>

      {groups.map((group) => (
        <div className={styles.group} key={group.kind}>
          <h2>{KIND_LABELS[group.kind]}</h2>
          <ul className={styles.grid}>
            {group.items.map((item) => {
              const equipped =
                equippedItemId(loadout, group.kind) === item.id;
              return (
                <li
                  className={`${styles.card} ${equipped ? styles.equipped : ""}`}
                  key={item.id}
                >
                  <div className={styles.cardHead}>
                    <span className={styles.name}>{item.name}</span>
                    {equipped ? (
                      <span className={styles.tag}>Equipped</span>
                    ) : !item.owned ? (
                      <span className={styles.locked}>Locked</span>
                    ) : null}
                  </div>
                  <p className={styles.desc}>{item.description}</p>
                  {item.owned && !equipped ? (
                    <form action={equipCosmetic}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <button className={styles.equipButton} type="submit">
                        Equip
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
