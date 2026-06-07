import { afterEach, describe, expect, it } from "vitest";

import { readSupabaseEnv } from "@/lib/supabase/env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("readSupabaseEnv", () => {
  it("returns configured public credentials", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    expect(readSupabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
    });
  });

  it("throws a useful error when configuration is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => readSupabaseEnv()).toThrow(
      "Supabase environment variables are not configured",
    );
  });
});
