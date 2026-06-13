// Public development defaults so `next dev` connects even when env files are
// not loaded for any reason. Publishable keys (sb_publishable_*) are designed
// to be exposed in client code and are protected by Row Level Security.
// Production (NODE_ENV !== "development") still requires real env vars.
const DEV_FALLBACK = {
  url: "https://ihpsxfgzplruwgaahjdd.supabase.co",
  publishableKey: "sb_publishable_Kv2yqu3wxjWmSsd8boW91Q_aNFjcWrJ",
};

export function readSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    if (process.env.NODE_ENV === "development") {
      return DEV_FALLBACK;
    }
    throw new Error("Supabase environment variables are not configured");
  }

  return { url, publishableKey };
}
