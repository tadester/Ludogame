"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function customizeRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/customize?${params.toString()}`);
}

async function requireClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/login");
  }
  return supabase;
}

export async function equipCosmetic(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) {
    customizeRedirect("That item is no longer available.");
  }

  const supabase = await requireClient();
  const { error } = await supabase.rpc("equip_cosmetic", { p_item_id: itemId });
  if (error) {
    customizeRedirect(
      error.code === "42501"
        ? "You don't own that item yet."
        : "Unable to equip that item. Try again.",
    );
  }

  revalidatePath("/customize");
  revalidatePath("/play");
  revalidatePath("/matches");
  revalidatePath("/", "layout");
  customizeRedirect("Equipped.");
}

export async function updatePreferences(formData: FormData) {
  const reducedMotion = formData.get("reducedMotion") === "on";
  const mutedAudio = formData.get("mutedAudio") === "on";

  const supabase = await requireClient();
  const { error } = await supabase.rpc("update_cosmetic_preferences", {
    p_reduced_motion: reducedMotion,
    p_muted_audio: mutedAudio,
  });
  if (error) {
    customizeRedirect("Unable to save preferences. Try again.");
  }

  revalidatePath("/customize");
  customizeRedirect("Preferences saved.");
}
