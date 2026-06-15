import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { readSupabaseEnv } from "@/lib/supabase/env";

/**
 * A Supabase client authenticated with the service role key. It bypasses Row
 * Level Security, so it must only be used in trusted server code (route
 * handlers and server actions) and never exposed to the browser.
 */
export function createServiceClient() {
  const { url } = readSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
