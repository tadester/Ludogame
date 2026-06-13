"use server";

import { redirect } from "next/navigation";

import { signUpErrorMessage } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { validateSignIn, validateSignUp } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(
  path: string,
  message: string,
  nextPath?: string,
): never {
  const params = new URLSearchParams({ message });
  if (nextPath) {
    params.set("next", nextPath);
  }
  redirect(`${path}?${params.toString()}`);
}

export async function signIn(formData: FormData) {
  const nextPath = safeNextPath(formData.get("next")?.toString() ?? null);
  const result = validateSignIn(formData);

  if (!result.ok) {
    redirectWithMessage("/login", result.message, nextPath);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.value);

  if (error) {
    redirectWithMessage(
      "/login",
      "Email or password is incorrect.",
      nextPath,
    );
  }

  redirect(nextPath);
}

export async function signUp(formData: FormData) {
  const result = validateSignUp(formData);

  if (!result.ok) {
    redirectWithMessage("/signup", result.message);
  }

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  const { error } = await supabase.auth.signUp({
    email: result.value.email,
    password: result.value.password,
    options: {
      data: {
        display_name: result.value.displayName,
        username: result.value.username,
      },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    redirectWithMessage("/signup", signUpErrorMessage(error));
  }

  redirect("/check-email");
}
