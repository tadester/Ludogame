import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  background?: string;
  reducedMotion?: boolean;
};

export function AppShell({
  children,
  background = "midnight",
  reducedMotion = false,
}: AppShellProps) {
  return (
    <div
      className="app-shell"
      data-background={background}
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <header className="app-header">
        <span aria-hidden="true" className="brand-mark" />
        <span className="brand-name">Ludo</span>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
