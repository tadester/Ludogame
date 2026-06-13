import { describe, expect, it } from "vitest";

import { signUpErrorMessage } from "@/lib/auth/errors";

describe("signUpErrorMessage", () => {
  it("explains when Supabase has temporarily rate-limited signup email", () => {
    expect(
      signUpErrorMessage({ code: "over_email_send_rate_limit" }),
    ).toBe(
      "The email service has reached its temporary limit. Wait a few minutes and try again.",
    );
  });

  it("does not expose unexpected authentication errors", () => {
    expect(signUpErrorMessage({ code: "unexpected_failure" })).toBe(
      "Unable to create the account. Check your details and try again.",
    );
  });
});
