import { describe, it, expect } from "vitest";
import {
  activityLabel,
  isShopVerified,
  openingHoursRows,
  shopInitials,
  shopSchemaType,
} from "./format";

describe("shopInitials", () => {
  it("takes the first letters of the name, not of the town after the dot", () => {
    expect(shopInitials("Auto Deal · Tunis")).toBe("AD");
    expect(shopInitials("Mega Motors · Sousse")).toBe("MM");
  });

  it("folds accents and copes with a single word", () => {
    expect(shopInitials("Électro")).toBe("EL");
  });

  it("never returns an empty string", () => {
    expect(shopInitials("· ·")).toBe("?");
  });
});

describe("openingHoursRows", () => {
  it("lists filled days in week order, in French", () => {
    expect(openingHoursRows({ sat: "9h – 13h", mon: "8h30 – 18h", sun: "Fermé" })).toEqual([
      { day: "Lundi", hours: "8h30 – 18h" },
      { day: "Samedi", hours: "9h – 13h" },
      { day: "Dimanche", hours: "Fermé" },
    ]);
  });

  it("ignores anything that is not a day with text", () => {
    expect(openingHoursRows({ mon: "", tue: 9, xyz: "8h" })).toEqual([]);
    expect(openingHoursRows(null)).toEqual([]);
    expect(openingHoursRows(["mon"])).toEqual([]);
  });
});

describe("labels and types", () => {
  it("names each activity", () => {
    expect(activityLabel("location_auto")).toBe("Location de véhicules");
    expect(activityLabel("nope")).toBe("Boutique");
  });

  it("files each activity under its schema.org type", () => {
    expect(shopSchemaType("vente_auto")).toBe("AutoDealer");
    expect(shopSchemaType("location_auto")).toBe("AutoRental");
    expect(shopSchemaType("pieces_auto")).toBe("AutoPartsStore");
  });

  it("calls a shop verified only when an admin verified it (recette 10)", () => {
    expect(isShopVerified({ verification_status: "verified" })).toBe(true);
    for (const s of ["unverified", "pending", "rejected", null]) {
      expect(isShopVerified({ verification_status: s })).toBe(false);
    }
  });
});
