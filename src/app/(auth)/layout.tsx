import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="auth-layout">{children}</div>
    </AppShell>
  );
}
