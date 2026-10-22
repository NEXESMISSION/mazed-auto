import { describe, it, expect } from "vitest";
import {
  activityLabel,
  isShopVerified,
  openingHoursRows,
  openingHoursSpec,
  shopInitials,
  shopSchemaType,
  slugifyShopName,
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

describe("slugifyShopName", () => {
  it("matches the agency backfill's slugs", () => {
    expect(slugifyShopName("Auto Deal · Tunis")).toBe("auto-deal-tunis");
    expect(slugifyShopName("Garage Démo · Sousse")).toBe("garage-demo-sousse");
  });
  it("always gives a usable slug", () => {
    expect(slugifyShopName("AB")).toBe("boutique-ab");
    expect(slugifyShopName("···")).toBe("boutique-pro");
    expect(slugifyShopName("x".repeat(80))).toHaveLength(50);
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

describe("openingHoursSpec", () => {
  const day = (d: string) => `https://schema.org/${d}`;

  it("reads the ways owners write hours", () => {
    expect(openingHoursSpec({ mon: "8h30 - 18h", tue: "9:00-12:00 / 14:00-18:00", wed: "9h à 17h" })).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: day("Monday"), opens: "08:30", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: day("Tuesday"), opens: "09:00", closes: "12:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: day("Tuesday"), opens: "14:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: day("Wednesday"), opens: "09:00", closes: "17:00" },
    ]);
  });

  it("leaves out what it cannot read instead of inventing it", () => {
    expect(openingHoursSpec({ sun: "Fermé", sat: "Sur rendez-vous", fri: "25h-30h", thu: "18h-9h" })).toEqual([]);
    expect(openingHoursSpec(null)).toEqual([]);
    expect(openingHoursSpec(["9h-18h"])).toEqual([]);
  });
});
