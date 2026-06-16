import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ProtectedError from "@/app/(protected)/error";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("shows a 404 message and a link home", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("ProtectedError", () => {
  it("renders an alert and retries when asked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ProtectedError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
