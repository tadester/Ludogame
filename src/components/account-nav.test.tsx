import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountNav } from "@/components/account-nav";

describe("AccountNav", () => {
  it("links to the account areas and signs out with POST", () => {
    const { container } = render(<AccountNav coins={1234} />);

    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Friends" })).toHaveAttribute(
      "href",
      "/friends",
    );
    expect(screen.getByRole("link", { name: "Store" })).toHaveAttribute(
      "href",
      "/store",
    );
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/customize",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByText("1,234")).toBeVisible();
    expect(
      container.querySelector('form[action="/auth/signout"]'),
    ).toHaveAttribute("method", "post");
  });

  it("shows the admin link only for admins", () => {
    const { rerender } = render(<AccountNav />);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    rerender(<AccountNav isAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("surfaces pending room invites in the account links", () => {
    render(<AccountNav roomInviteCount={2} />);

    expect(
      screen.getByRole("link", { name: "Room invites 2" }),
    ).toHaveAttribute("href", "/rooms");
  });
});
