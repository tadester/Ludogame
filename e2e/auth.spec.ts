import { expect, test } from "@playwright/test";

import { clearMailpit, waitForEmailLink } from "./support/mailpit";

test("creates, confirms, edits, recovers, and signs into an account", async ({
  page,
  request,
}) => {
  await clearMailpit(request);

  const unique = Date.now().toString(36);
  const email = `player-${unique}@example.com`;
  const username = `player_${unique}`;
  const originalPassword = "OriginalPass123!";
  const newPassword = "RecoveredPass456!";

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("First Player");
  await page.getByLabel("Username (optional)").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(originalPassword);
  await page.getByLabel("Confirm password").fill(originalPassword);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { name: "Confirm your account" }),
  ).toBeVisible();

  const confirmationLink = await waitForEmailLink(
    request,
    email,
    "Confirm Your Email",
  );
  await page.goto(confirmationLink);

  await expect(
    page.getByRole("heading", { name: "Choose how to play" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Display name").fill("Updated Player");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile updated.");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(originalPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose how to play" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset password" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If an account exists",
  );

  const recoveryLink = await waitForEmailLink(
    request,
    email,
    "Reset Your Password",
  );
  await page.goto(recoveryLink);

  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?message=password-updated$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose how to play" }),
  ).toBeVisible();
});
