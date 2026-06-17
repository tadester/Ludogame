import Link from "next/link";
import { redirect } from "next/navigation";

import { grantCoins, setBan } from "@/app/(protected)/admin/actions";
import { formatCoins, isDevEmail } from "@/lib/economy/economy";
import type { AdminUser, PlayerWallet } from "@/lib/economy/economy";
import { createClient } from "@/lib/supabase/server";

import styles from "./admin.module.css";

type AdminPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect("/login");
  }

  const email = (claims.claims as { email?: string }).email;
  const { data: wallet } = await supabase
    .rpc("get_player_wallet")
    .maybeSingle<PlayerWallet>();
  if (wallet?.role !== "admin" && !isDevEmail(email)) {
    redirect("/");
  }

  // Moderation RPCs enforce the database admin role. If the role backfill has
  // not run yet they return an authorization error; degrade to an empty list
  // with a setup notice rather than crashing the page.
  const { data, error } = await supabase.rpc("admin_list_users");
  const users = (data ?? []) as AdminUser[];
  const setupPending = !!error;
  const { message } = await searchParams;

  return (
    <section className={styles.page}>
      <div>
        <p className="eyebrow">Admin</p>
        <h1>Moderation</h1>
        <p>
          Manage players, balances, and bans — or use the{" "}
          <Link href="/admin/terminal">command console</Link>.
        </p>
      </div>

      {message ? (
        <p className={styles.banner} role="status">
          {message}
        </p>
      ) : null}

      {setupPending ? (
        <p className={styles.banner} role="status">
          Admin database role isn’t active yet. Apply the latest migrations to
          enable moderation actions.
        </p>
      ) : null}

      <ul className={styles.list}>
        {users.map((user) => (
          <li className={styles.row} key={user.id}>
            <span className={styles.who}>
              {user.display_name}
              <small>
                {user.username ? `@${user.username}` : "no username"} ·{" "}
                {user.role}
                {user.banned ? " · banned" : ""}
              </small>
            </span>
            <span className={styles.balance}>
              ◎ {formatCoins(user.coins)}
            </span>
            <span className={styles.actions}>
              <form action={grantCoins} className={styles.coinForm}>
                <input name="userId" type="hidden" value={user.id} />
                <input
                  aria-label={`Coins to grant ${user.display_name}`}
                  className={styles.amount}
                  defaultValue={100}
                  name="amount"
                  type="number"
                />
                <button type="submit">Grant</button>
              </form>
              {user.role !== "admin" ? (
                <form action={setBan}>
                  <input name="userId" type="hidden" value={user.id} />
                  <input
                    name="banned"
                    type="hidden"
                    value={user.banned ? "false" : "true"}
                  />
                  <button
                    className={user.banned ? styles.unban : styles.ban}
                    type="submit"
                  >
                    {user.banned ? "Unban" : "Ban"}
                  </button>
                </form>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
