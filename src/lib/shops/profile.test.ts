import { describe, it, expect } from "vitest";
import { normalizePhone, sanitizeShopProfile } from "./profile";

const SHOP = "11111111-1111-1111-1111-111111111111";

describe("normalizePhone", () => {
  it("turns 8 local digits into +216", () => {
    expect(normalizePhone("98 120 622")).toBe("+21698120622");
  });
  it("keeps an international number", () => {
    expect(normalizePhone("+216 98 120 622")).toBe("+21698120622");
  });
  it("clears on empty, refuses garbage", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("appelez-moi")).toBeUndefined();
  });
});

describe("sanitizeShopProfile", () => {
  it("keeps the public fields and normalises them", () => {
    const { patch, errors } = sanitizeShopProfile({
      name: "  Auto Deal  ", description: "Voitures contrôlées.", phone: "71 000 111",
      governorate: "Sousse", city: "Sahloul", opening_hours: { mon: "8h – 18h", sun: "", xyz: "9h" },
    }, SHOP);
    expect(errors).toEqual([]);
    expect(patch).toEqual({
      name: "Auto Deal", description: "Voitures contrôlées.", phone: "+21671000111",
      governorate: "Sousse", city: "Sahloul", opening_hours: { mon: "8h – 18h" },
    });
  });

  it("never carries a state column, whatever the body says", () => {
    const { patch } = sanitizeShopProfile(
      { name: "X shop", status: "active", verification_status: "verified", owner_id: "someone", slug: "x" } as never,
      SHOP,
    );
    expect(Object.keys(patch)).toEqual(["name"]);
  });

  it("refuses a too-short name, an unknown governorate and a bad phone", () => {
    const { errors } = sanitizeShopProfile({ name: "A", governorate: "Paris", whatsapp: "abc" }, SHOP);
    expect(errors).toHaveLength(3);
  });

  it("accepts a logo inside the shop's folder and nothing else", () => {
    expect(sanitizeShopProfile({ logo_path: `shops/${SHOP}/logo-1.webp` }, SHOP).patch.logo_path)
      .toBe(`shops/${SHOP}/logo-1.webp`);
    for (const bad of [
      "shops/another-shop/logo.webp",
      `shops/${SHOP}/../other/logo.webp`,
      "avatars/me.png",
    ]) {
      expect(sanitizeShopProfile({ logo_path: bad }, SHOP).errors).toHaveLength(1);
    }
  });

  it("lets the owner remove a banner", () => {
    expect(sanitizeShopProfile({ banner_path: null }, SHOP).patch).toEqual({ banner_path: null });
  });
});
