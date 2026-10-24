import { describe, it, expect } from "vitest";
import { TUNISIAN_GOVERNORATES } from "./tunisia";
import { GOVERNORATES } from "./governorates";
import { attributeLabel, attributeOptionLabel, categoryLabel, governorateLabel, unitLabel } from "./labels";
import { formatDate, timeAgo } from "./dates";
import { formatTND, currencyLabel } from "./utils";
import { localeFromRequest } from "@/i18n/api";

describe("labels", () => {
  it("names every governorate in Arabic, and leaves French alone", () => {
    for (const g of [...TUNISIAN_GOVERNORATES, ...GOVERNORATES]) {
      expect(governorateLabel(g, "ar")).toMatch(/\p{Script=Arabic}/u);
      expect(governorateLabel(g, "fr")).toBe(g);
    }
    expect(governorateLabel("Sahloul", "ar")).toBe("Sahloul");
  });

  it("prefers the code's Arabic, then the row's label_ar, then French", () => {
    expect(categoryLabel({ slug: "voitures", label_fr: "Voitures", label_ar: "x" }, "ar")).toBe("سيارات");
    expect(categoryLabel({ slug: "nouvelle", label_fr: "Nouvelle", label_ar: "جديدة" }, "ar")).toBe("جديدة");
    expect(categoryLabel({ slug: "nouvelle", label_fr: "Nouvelle", label_ar: null }, "ar")).toBe("Nouvelle");
    expect(categoryLabel({ slug: "voitures", label_fr: "Voitures" }, "fr")).toBe("Voitures");
  });

  it("translates attributes, options and units with a French fallback", () => {
    expect(attributeLabel("fuel", "Carburant", "ar")).toBe("الوقود");
    expect(attributeLabel("fuel", "Carburant", "fr")).toBe("Carburant");
    expect(attributeLabel("new_one", "Nouveau", "ar")).toBe("Nouveau");
    expect(attributeOptionLabel("fuel", "diesel", "Diesel", "ar")).toBe("ديزل");
    expect(unitLabel("km", "ar")).toBe("كم");
    expect(unitLabel("km", "fr")).toBe("km");
  });
});

describe("numbers and dates in Arabic", () => {
  it("groups prices like French, never with a millimes-looking dot", () => {
    expect(formatTND(45000, "ar")).toBe(formatTND(45000, "fr"));
    expect(formatTND(45000, "ar")).not.toContain(".");
    expect(currencyLabel("ar")).toBe("د.ت");
    expect(currencyLabel("fr")).toBe("TND");
  });

  it("writes Tunisian month names with Western digits", () => {
    const d = formatDate("2026-01-15T12:00:00Z", "ar");
    expect(d).toContain("جانفي");
    expect(d).toContain("2026");
    expect(formatDate("2026-01-15T12:00:00Z", "fr")).toContain("janvier");
  });

  it("says how long ago in the reader's language", () => {
    const now = Date.parse("2026-01-15T12:00:00Z");
    expect(timeAgo("2026-01-15T09:00:00Z", "fr", now)).toBe("il y a 3 heures");
    expect(timeAgo("2026-01-15T09:00:00Z", "ar", now)).toMatch(/3/);
  });
});

describe("localeFromRequest", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/api/y", { headers });
  it("reads the calling page's locale, then the cookie, then defaults to French", () => {
    expect(localeFromRequest(req({ referer: "http://x/ar/annonces" }))).toBe("ar");
    expect(localeFromRequest(req({ referer: "http://x/fr/annonces", cookie: "NEXT_LOCALE=ar" }))).toBe("fr");
    expect(localeFromRequest(req({ cookie: "a=1; NEXT_LOCALE=ar" }))).toBe("ar");
    expect(localeFromRequest(req({}))).toBe("fr");
  });
});
