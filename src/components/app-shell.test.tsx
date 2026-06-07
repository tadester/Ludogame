import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  it("renders the Ludo brand and its children", () => {
    render(
      <AppShell>
        <p>Choose a game</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("Ludo");
    expect(screen.getByText("Choose a game")).toBeVisible();
  });
});
