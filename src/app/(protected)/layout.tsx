import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountNav } from "@/components/account-nav";
import { AppShell } from "@/components/app-shell";
import { loadPlayerTheme } from "@/lib/cosmetics/theme";
import { isDevEmail } from "@/lib/economy/economy";
import { loadPlayerWallet } from "@/lib/economy/wallet";
import { createClient } from "@/lib/supabase/server";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    redirect("/login");
  }

  const email = (data.claims as { email?: string }).email;

  const [theme, wallet] = await Promise.all([
    loadPlayerTheme(),
    loadPlayerWallet(),
  ]);
  const { data: roomInvites } = await supabase.rpc("list_room_invites");
  const roomInviteCount = Array.isArray(roomInvites) ? roomInvites.length : 0;

  // Treat the configured developer account as an admin even if the database
  // role backfill has not run yet, so the admin panel is always reachable.
  const isAdmin = wallet.role === "admin" || isDevEmail(email);

  if (wallet.banned) {
    return (
      <AppShell background={theme.background} reducedMotion={theme.reducedMotion}>
        <section className="status-card" role="alert">
          <p className="eyebrow">Account suspended</p>
          <h1>You’re banned</h1>
          <p>
            This account has been suspended by an administrator. Contact support
            if you think this is a mistake.
          </p>
          <form action="/auth/signout" method="post">
            <button className="primary-button" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell background={theme.background} reducedMotion={theme.reducedMotion}>
      <AccountNav
        coins={wallet.coins}
        isAdmin={isAdmin}
        roomInviteCount={roomInviteCount}
      />
      {children}
    </AppShell>
  );
}
