import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountNav } from "@/components/account-nav";
import { AppShell } from "@/components/app-shell";
import { loadPlayerTheme } from "@/lib/cosmetics/theme";
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

  const theme = await loadPlayerTheme();

  return (
    <AppShell
      background={theme.background}
      reducedMotion={theme.reducedMotion}
    >
      <AccountNav />
      {children}
    </AppShell>
  );
}
