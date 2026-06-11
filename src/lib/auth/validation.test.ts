import { describe, expect, it } from "vitest";

import {
  validateNewPassword,
  validateProfile,
  validateSignIn,
  validateSignUp,
} from "@/lib/auth/validation";

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("auth validation", () => {
  it("normalizes sign-in email addresses", () => {
    expect(
      validateSignIn(
        formData({
          email: " PLAYER@EXAMPLE.COM ",
          password: "password123",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        email: "player@example.com",
        password: "password123",
      },
    });
  });

  it("rejects invalid email addresses", () => {
    expect(
      validateSignIn(formData({ email: "not-an-email", password: "password123" })),
    ).toMatchObject({ ok: false });
  });

  it("rejects passwords shorter than eight characters", () => {
    expect(
      validateSignIn(formData({ email: "p@example.com", password: "short" })),
    ).toEqual({ ok: false, message: "Password must be at least 8 characters." });
  });

  it("rejects mismatched sign-up passwords", () => {
    expect(
      validateSignUp(
        formData({
          email: "p@example.com",
          password: "password123",
          passwordConfirmation: "password456",
          displayName: "Player",
          username: "player_one",
        }),
      ),
    ).toEqual({ ok: false, message: "Passwords do not match." });
  });

  it("normalizes valid sign-up profile fields", () => {
    expect(
      validateSignUp(
        formData({
          email: "P@EXAMPLE.COM",
          password: "password123",
          passwordConfirmation: "password123",
          displayName: "  Player One  ",
          username: " Player_One ",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        email: "p@example.com",
        password: "password123",
        displayName: "Player One",
        username: "player_one",
      },
    });
  });

  it("rejects display names longer than forty characters", () => {
    expect(
      validateProfile(
        formData({ displayName: "x".repeat(41), username: "player_one" }),
      ),
    ).toEqual({
      ok: false,
      message: "Display name must be between 1 and 40 characters.",
    });
  });

  it("rejects usernames with unsupported characters", () => {
    expect(
      validateProfile(
        formData({ displayName: "Player", username: "player-one" }),
      ),
    ).toEqual({
      ok: false,
      message:
        "Username must be 3-24 characters using only letters, numbers, or underscores.",
    });
  });

  it("validates and confirms a new password", () => {
    expect(
      validateNewPassword(
        formData({
          password: "new-password",
          passwordConfirmation: "new-password",
        }),
      ),
    ).toEqual({ ok: true, value: { password: "new-password" } });
  });
});
