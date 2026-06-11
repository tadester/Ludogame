import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountNav } from "@/components/account-nav";

describe("AccountNav", () => {
  it("links to the account areas and signs out with POST", () => {
    const { container } = render(<AccountNav />);

    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Friends" })).toHaveAttribute(
      "href",
      "/friends",
    );
    expect(screen.getByRole("link", { name: "Customize" })).toHaveAttribute(
      "href",
      "/customize",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(container.querySelector("form")).toHaveAttribute("method", "post");
    expect(container.querySelector("form")).toHaveAttribute(
      "action",
      "/auth/signout",
    );
  });
});
