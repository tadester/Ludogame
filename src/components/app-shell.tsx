import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span aria-hidden="true" className="brand-mark" />
        <span className="brand-name">Ludo</span>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
