import { describe, expect, it } from "vitest";

import {
  confirmationRedirect,
  passwordRecoveryRedirect,
} from "@/lib/auth/recovery";

describe("confirmationRedirect", () => {
  it("removes OTP credentials from a successful redirect", () => {
    const requestUrl =
      "http://localhost:3100/auth/confirm?token_hash=secret&type=signup";

    expect(confirmationRedirect(requestUrl, true)).toBe(
      "http://localhost:3100/",
    );
  });

  it("returns a stable login error without OTP credentials", () => {
    const requestUrl =
      "http://localhost:3100/auth/confirm?token_hash=secret&type=signup";

    expect(confirmationRedirect(requestUrl, false)).toBe(
      "http://localhost:3100/login?message=invalid-confirmation",
    );
  });
});

describe("passwordRecoveryRedirect", () => {
  it("establishes the recovery session before updating the password", () => {
    expect(passwordRecoveryRedirect("http://localhost:3100/")).toBe(
      "http://localhost:3100/auth/confirm?next=%2Fupdate-password",
    );
  });
});
