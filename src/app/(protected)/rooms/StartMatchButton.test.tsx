import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartMatchButton } from "@/app/(protected)/rooms/StartMatchButton";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("StartMatchButton", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("explains when the match service is not configured", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "service_not_configured" }), {
        status: 500,
      }),
    );

    render(<StartMatchButton roomId="room-1" />);

    await user.click(screen.getByRole("button", { name: "Start match" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The match server needs a production service key. Redeploy after setting SUPABASE_SERVICE_ROLE_KEY.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
