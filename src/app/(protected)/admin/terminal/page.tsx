import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminTerminal } from "@/app/(protected)/admin/terminal/AdminTerminal";
import type { PlayerWallet } from "@/lib/economy/economy";
import { createClient } from "@/lib/supabase/server";

import styles from "./terminal.module.css";

export default async function AdminTerminalPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect("/login");
  }
  const { data: wallet } = await supabase
    .rpc("get_player_wallet")
    .maybeSingle<PlayerWallet>();
  if (wallet?.role !== "admin") {
    redirect("/");
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Console</h1>
        </div>
        <Link className={styles.back} href="/admin">
          ← Moderation
        </Link>
      </div>
      <p className={styles.note}>
        Tweak the game from the command line. Type <code>/help</code> for the
        full list.
      </p>
      <AdminTerminal />
    </section>
  );
}
