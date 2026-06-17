"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateProfile } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function profileRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/profile?${params.toString()}`);
}

export async function updateProfile(formData: FormData) {
  const result = validateProfile(formData);

  if (!result.ok) {
    profileRedirect(result.message);
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("update_player_profile", {
    p_display_name: result.value.displayName,
    p_username: result.value.username,
  });

  if (error?.code === "23505") {
    profileRedirect("That username is already taken.");
  }

  if (error?.code === "23514") {
    profileRedirect(error.message || "Check your profile details and try again.");
  }

  if (error) {
    profileRedirect("Unable to update your profile. Try again.");
  }

  revalidatePath("/profile");
  profileRedirect("Profile updated.");
}
