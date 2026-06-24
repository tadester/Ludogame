import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { OnlineMatch } from "./online-match";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => undefined,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

describe("OnlineMatch", () => {
  it("shows Extreme power tiles and random safe zones from the snapshot", () => {
    const snapshot = setupLocalMatch(
      [{ name: "Ada" }, { name: "Ben" }],
      "extreme",
    );
    const { container } = render(
      <OnlineMatch
        matchId="match-1"
        userId="p1"
        initial={{
          ...snapshot,
          powerUps: {
            ...snapshot.powerUps!,
            tiles: [{ ringIndex: 60, power: "dash" }],
            safeRingIndexes: [0, 25, 50, 75, 10, 35, 60, 85],
          },
        }}
      />,
    );

    expect(container.querySelector('[aria-label="power tile"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="safe zone"]')).not.toBeNull();
  });

  it("uses the shared match HUD to show my color, players, timer, and dice", () => {
    const snapshot = {
      ...setupLocalMatch([{ name: "Ada" }, { name: "Ben" }], "nigerian"),
      turnTimerSeconds: 30,
    };
    const { container } = render(
      <OnlineMatch matchId="match-1" userId="p1" initial={snapshot} />,
    );

    expect(screen.getByText("You are red")).toBeVisible();
    expect(screen.getByText("Timer: 30s")).toBeVisible();
    expect(screen.getAllByText("Ada").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Ben")).toBeVisible();
    expect(container.querySelectorAll("[data-dice-skin]")).toHaveLength(2);
  });
});
