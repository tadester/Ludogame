import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { LocalMatch } from "./local-match";

afterEach(() => {
  localStorage.clear();
});

describe("LocalMatch", () => {
  it("shows the setup screen and starts a two-player board", async () => {
    const user = userEvent.setup();
    render(<LocalMatch />);

    expect(
      screen.getByRole("heading", { name: /pass & play/i }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Start game" }));

    // Board renders four tokens per player (two players = eight).
    const tokens = screen.getAllByRole("button", { name: /token \d/i });
    expect(tokens).toHaveLength(8);

    // Red is first to act, with a roll-ready dice control.
    expect(screen.getAllByRole("button", { name: /roll dice/i })[0]).toBeEnabled();
    expect(screen.getByText("Red to roll.")).toBeVisible();
  });

  it("offers to resume a saved game after one was started", async () => {
    const user = userEvent.setup();
    const first = render(<LocalMatch />);
    await user.click(screen.getByRole("button", { name: "Start game" }));
    first.unmount();

    // A fresh mount finds the persisted match and offers to resume it.
    render(<LocalMatch />);
    await user.click(
      await screen.findByRole("button", { name: /resume saved game/i }),
    );
    expect(screen.getAllByRole("button", { name: /token \d/i })).toHaveLength(8);
  });

  it("lets the player choose four colors", async () => {
    const user = userEvent.setup();
    render(<LocalMatch />);

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));

    expect(screen.getAllByRole("button", { name: /token \d/i })).toHaveLength(16);
    for (const name of ["Red", "Green", "Yellow", "Blue"]) {
      expect(within(document.body).getAllByText(name).length).toBeGreaterThan(0);
    }
  });
});
