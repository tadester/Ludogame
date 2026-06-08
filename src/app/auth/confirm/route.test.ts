import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession,
      verifyOtp,
    },
  }),
}));

import { GET } from "@/app/auth/confirm/route";

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
  });

  it("exchanges a PKCE code and redirects without exposing it", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(
        "http://localhost:3100/auth/confirm?code=secret&next=/update-password",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("secret");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/update-password",
    );
  });
});
