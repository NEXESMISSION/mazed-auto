import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNext";

/** The redirect after sign-in stays on this site, whatever `next` holds. */
describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/fr/account/favoris")).toBe("/fr/account/favoris");
    expect(safeNextPath("/ar/pro/dashboard?tab=1")).toBe("/ar/pro/dashboard?tab=1");
  });

  it("refuses anything a browser would take off-site", () => {
    for (const bad of [
      "//evil.com", "/\\evil.com", "\\evil.com", "https://evil.com", "evil.com",
      "/\t/evil.com", "/\n/evil.com", "/ /evil.com", "/javascript:alert(1)", "/%09/evil.com".replace("%09", "\t"),
    ]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBe("/");
    }
  });

  it("falls back to what the caller chooses", () => {
    expect(safeNextPath(null, "/fr")).toBe("/fr");
    expect(safeNextPath("//x", "/ar")).toBe("/ar");
  });
});
