import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims },
    rpc: mocks.rpc,
  }),
}));

import { equipCosmetic } from "@/app/(protected)/customize/actions";

describe("customize actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.redirect.mockClear();
    mocks.getClaims.mockReset();
    mocks.rpc.mockReset();
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("refreshes game surfaces after equipping a cosmetic", async () => {
    const formData = new FormData();
    formData.set("itemId", "token-item");

    await expect(equipCosmetic(formData)).rejects.toThrow(
      "redirect:/customize?message=Equipped.",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("equip_cosmetic", {
      p_item_id: "token-item",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customize");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/play");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/matches");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
