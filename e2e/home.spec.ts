import { expect, test } from "@playwright/test";

test("shows the phone-first play choices", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose how to play" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Friend room" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pass the phone" }),
  ).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
