import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { OnlineMatch } from "./online-match";

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
});
