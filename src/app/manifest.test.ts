import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("manifest", () => {
  it("defines an installable standalone application", () => {
    expect(manifest()).toMatchObject({
      name: "Ludo",
      short_name: "Ludo",
      display: "standalone",
      start_url: "/",
      theme_color: "#07111f",
      background_color: "#07111f",
    });
  });
});
