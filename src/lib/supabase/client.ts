import { createBrowserClient } from "@supabase/ssr";

import { readSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = readSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
