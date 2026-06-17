import Link from "next/link";
import { redirect } from "next/navigation";

import { purchaseCosmetic } from "@/app/(protected)/store/actions";
import { KIND_LABELS } from "@/lib/cosmetics/cosmetics";
import type { CosmeticKind } from "@/lib/cosmetics/cosmetics";
import { canAfford, formatCoins } from "@/lib/economy/economy";
import type { PlayerWallet, StoreItem } from "@/lib/economy/economy";
import { createClient } from "@/lib/supabase/server";

import styles from "./store.module.css";

type StorePageProps = {
  searchParams: Promise<{ message?: string }>;
};

const KIND_ORDER: CosmeticKind[] = [
  "background",
  "board",
  "dice",
  "token",
  "animation",
  "sound",
  "effect",
];

export default async function StorePage({ searchParams }: StorePageProps) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect("/login");
  }

  const [{ data: items, error }, { data: walletRow }] = await Promise.all([
    supabase.rpc("list_store_items"),
    supabase.rpc("get_player_wallet").maybeSingle<PlayerWallet>(),
  ]);
  if (error) {
    throw new Error("Unable to load the store.");
  }

  const catalog = (items ?? []) as StoreItem[];
  const wallet = walletRow ?? null;
  const { message } = await searchParams;

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: catalog.filter((item) => item.kind === kind && !item.is_default),
  })).filter((group) => group.items.length > 0);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Store</p>
          <h1>Spend your coins</h1>
        </div>
        <div className={styles.wallet} aria-label="Coin balance">
          <span className={styles.coin} aria-hidden="true">
            ◎
          </span>
          {formatCoins(wallet?.coins ?? 0)}
        </div>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      <p className={styles.note}>
        Buy cosmetics here, then equip them in your{" "}
        <Link href="/customize">inventory</Link>. Cosmetics never affect how the
        game plays.
      </p>

      {groups.map((group) => (
        <div className={styles.group} key={group.kind}>
          <h2>{KIND_LABELS[group.kind]}</h2>
          <ul className={styles.grid}>
            {group.items.map((item) => {
              const affordable = canAfford(wallet, item.price);
              return (
                <li className={styles.card} key={item.id}>
                  <div className={styles.cardHead}>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.price}>
                      <span aria-hidden="true">◎</span> {formatCoins(item.price)}
                    </span>
                  </div>
                  <p className={styles.desc}>{item.description}</p>
                  {item.owned ? (
                    <span className={styles.owned}>Owned</span>
                  ) : (
                    <form action={purchaseCosmetic}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <button
                        className={styles.buy}
                        disabled={!affordable}
                        type="submit"
                      >
                        {affordable ? "Buy" : "Not enough coins"}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
