"use server";

import { redirect } from "next/navigation";

import { passwordRecoveryRedirect } from "@/lib/auth/recovery";
import {
  validateNewPassword,
  validatePasswordReset,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(path: string, message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`${path}?${params.toString()}`);
}

export async function requestPasswordReset(formData: FormData) {
  const result = validatePasswordReset(formData);

  if (!result.ok) {
    redirectWithMessage("/forgot-password", result.message);
  }

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

  await supabase.auth.resetPasswordForEmail(result.value.email, {
    redirectTo: passwordRecoveryRedirect(siteUrl),
  });

  redirectWithMessage(
    "/forgot-password",
    "If an account exists for that email, a reset link is on its way.",
  );
}

export async function updatePassword(formData: FormData) {
  const result = validateNewPassword(formData);

  if (!result.ok) {
    redirectWithMessage("/update-password", result.message);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirectWithMessage("/login", "invalid-recovery-session");
  }

  const { error } = await supabase.auth.updateUser({
    password: result.value.password,
  });

  if (error) {
    redirectWithMessage(
      "/update-password",
      "Unable to update the password. Request a new reset link.",
    );
  }

  await supabase.auth.signOut();
  redirectWithMessage("/login", "password-updated");
}
