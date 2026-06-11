import { redirect } from "next/navigation";

import { updateProfile } from "@/app/(protected)/profile/actions";
import { createClient } from "@/lib/supabase/server";

type ProfilePageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function ProfilePage({
  searchParams,
}: ProfilePageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error("Unable to load the player profile.");
  }

  const { message } = await searchParams;

  return (
    <section className="profile-card">
      <div>
        <p className="eyebrow">Profile</p>
        <h1>Player identity</h1>
        <p>Choose how friends will recognize you.</p>
      </div>

      {message ? <p role="status">{message}</p> : null}

      <form action={updateProfile} className="auth-form">
        <label>
          <span>Display name</span>
          <input
            defaultValue={profile.display_name}
            maxLength={40}
            name="displayName"
            required
          />
        </label>
        <label>
          <span>Username (optional)</span>
          <input
            autoCapitalize="none"
            defaultValue={profile.username ?? ""}
            maxLength={24}
            minLength={3}
            name="username"
            pattern="[A-Za-z0-9_]+"
          />
        </label>
        <button className="primary-button" type="submit">
          Save profile
        </button>
      </form>
    </section>
  );
}
