import { expect, test } from "@playwright/test";

test("requires an account before showing play choices", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
