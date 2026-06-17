"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function storeRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/store?${params.toString()}`);
}

export async function purchaseCosmetic(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) {
    storeRedirect("That item is no longer available.");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("purchase_cosmetic", {
    p_item_id: itemId,
  });
  if (error) {
    if (error.code === "23514") storeRedirect("You don't have enough coins.");
    if (error.code === "23505") storeRedirect("You already own that item.");
    storeRedirect("Unable to complete the purchase. Try again.");
  }

  revalidatePath("/store");
  revalidatePath("/customize");
  storeRedirect("Purchased! Equip it from your inventory.");
}
