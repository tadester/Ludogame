import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("presents the two approved play types", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Choose how to play" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Friend room" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Pass the phone" }),
    ).toBeDisabled();
  });
});
