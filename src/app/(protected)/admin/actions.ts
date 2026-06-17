"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function adminRedirect(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/admin?${params.toString()}`);
}

async function requireClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    redirect("/login");
  }
  return supabase;
}

export async function setBan(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const banned = String(formData.get("banned") ?? "") === "true";
  if (!userId) adminRedirect("That user is no longer available.");

  const supabase = await requireClient();
  const { error } = await supabase.rpc("admin_set_ban", {
    p_user_id: userId,
    p_banned: banned,
  });
  if (error) {
    adminRedirect(
      error.code === "42501"
        ? "Not allowed."
        : "Unable to update that user. Try again.",
    );
  }

  revalidatePath("/admin");
  adminRedirect(banned ? "User banned." : "User unbanned.");
}

export async function grantCoins(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const amount = Number(formData.get("amount"));
  if (!userId || !Number.isFinite(amount) || amount === 0) {
    adminRedirect("Enter a non-zero coin amount.");
  }

  const supabase = await requireClient();
  const { error } = await supabase.rpc("admin_grant_coins", {
    p_user_id: userId,
    p_amount: Math.trunc(amount),
  });
  if (error) {
    adminRedirect(
      error.code === "42501" ? "Not allowed." : "Unable to grant coins.",
    );
  }

  revalidatePath("/admin");
  adminRedirect("Coins updated.");
}
