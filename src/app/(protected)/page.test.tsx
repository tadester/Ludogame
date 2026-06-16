import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/(protected)/page";

describe("Home", () => {
  it("presents the two approved play types", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Choose how to play" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Friend room" })).toHaveAttribute(
      "href",
      "/rooms",
    );
    expect(screen.getByRole("link", { name: "Pass the phone" })).toHaveAttribute(
      "href",
      "/play",
    );
  });
});
