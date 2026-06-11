import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
  it("renders accessible sign-in fields and an error", () => {
    render(
      <AuthForm
        action={vi.fn()}
        description="Welcome back"
        message="Invalid credentials"
        submitLabel="Sign in"
        title="Sign in"
      />,
    );

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("renders the additional sign-up fields", () => {
    render(
      <AuthForm
        action={vi.fn()}
        description="Create your player profile"
        mode="signup"
        submitLabel="Create account"
        title="Create account"
      />,
    );

    expect(screen.getByLabelText("Display name")).toBeVisible();
    expect(screen.getByLabelText("Username (optional)")).toBeVisible();
    expect(screen.getByLabelText("Confirm password")).toBeVisible();
  });
});
