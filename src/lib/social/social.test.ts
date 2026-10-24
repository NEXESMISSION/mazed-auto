import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, readState, signState } from "./crypto";
import { buildFacts, checkFacts, numbersIn, type FactsSource } from "./facts";
import { classify } from "./meta";
import { finalText, templateDraft } from "./templates";
import { readSocialUtm, socialLink } from "./utm";

const KEY = randomBytes(32).toString("base64");
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.SOCIAL_TOKEN_KEY;
  process.env.SOCIAL_TOKEN_KEY = KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SOCIAL_TOKEN_KEY;
  else process.env.SOCIAL_TOKEN_KEY = saved;
});

describe("tokens", () => {
  it("round-trips, and nothing else reads it", () => {
    const c = encryptToken("EAAG-page-token");
    expect(c.startsWith("v1:")).toBe(true);
    expect(c).not.toContain("EAAG");
    expect(decryptToken(c)).toBe("EAAG-page-token");
    expect(decryptToken(c.slice(0, -4) + "AAAA")).toBeNull();          // tampered
    process.env.SOCIAL_TOKEN_KEY = randomBytes(32).toString("base64");
    expect(decryptToken(c)).toBeNull();                                // another key
    expect(decryptToken(null)).toBeNull();
  });

  it("refuses to encrypt without a 32-byte key", () => {
    process.env.SOCIAL_TOKEN_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptToken("x")).toThrow();
  });
});

describe("OAuth state", () => {
  const s = { shopId: "shop-1", userId: "user-1", nonce: "n1", exp: Date.now() + 60_000 };
  it("holds when signed and fresh, fails when altered or expired", () => {
    const raw = signState(s);
    expect(readState(raw)).toMatchObject({ shopId: "shop-1", userId: "user-1" });
    const [payload, mac] = raw.split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, shopId: "shop-2" })).toString("base64url");
    expect(readState(`${forged}.${mac}`)).toBeNull();
    expect(readState(`${payload}.x${mac.slice(1)}`)).toBeNull();
    expect(readState(raw, Date.now() + 120_000)).toBeNull();
  });
});

describe("UTM", () => {
  it("tags the annonce link and reads it back", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const link = socialLink(id, "instagram", id);
    const u = new URL(link);
    expect(u.pathname).toBe(`/fr/annonces/${id}`);
    expect(readSocialUtm(u.searchParams)).toEqual({ network: "instagram", content: id });
    expect(readSocialUtm(new URLSearchParams("utm_source=facebook&utm_medium=cpc"))).toBeNull();
  });
});

describe("numbers", () => {
  it("reads numbers the way people write them", () => {
    expect(numbersIn("61 000 DT")).toEqual(["61000"]);
    expect(numbersIn("61.000 DT, 85 000 km")).toEqual(["61000", "85000"]);
    expect(numbersIn("Golf 8 2019")).toEqual(["8", "2019"]);
    expect(numbersIn("61 000,00 TND")).toEqual(["61000"]);
    expect(numbersIn("موديل ٢٠١٩")).toEqual(["2019"]);
    expect(numbersIn("réf. MZ-00079")).toEqual(["79"]);
  });
});

const car: FactsSource = {
  title: "Volkswagen Golf 8 GTD", reference: "MZ-00079", listing_type: "vente_auto",
  attributes: { make: "Volkswagen", model: "Golf", year: "2021", mileage: 54000, fuel: "diesel", transmission: "automatic", color: "Gris" },
  condition: "used", price: 98500, price_unit: "total", price_on_request: false, negotiable: true,
  governorate: "Sousse", city: "Hammam Sousse", shopName: "Mega Motors · Sousse", categoryLabel: "Voitures",
};
const rental: FactsSource = {
  title: "Kia Picanto à la journée", reference: "MZ-00120", listing_type: "location_auto",
  attributes: { make: "Kia", model: "Picanto", year: "2023", rental_deposit: 500, rental_min_age: 21, rental_km_per_day: 250, rental_availability: "available" },
  price: 75, price_unit: "day", governorate: "Tunis", shopName: "Loc Tunis",
};
const part: FactsSource = {
  title: "Phare avant gauche Clio 4", reference: "MZ-00200", listing_type: "pieces_auto",
  attributes: { brand: "Valeo" }, condition: "new", price: 320, governorate: "Sfax",
};

describe("checkFacts", () => {
  const f = buildFacts(car);
  it("accepts the annonce's own numbers in any spelling", () => {
    expect(checkFacts("Golf 8 GTD 2021, 54 000 km, 98.500 DT. Réf. MZ-00079", ["#Golf"], f).ok).toBe(true);
  });
  it("refuses an invented price, year, mileage or feature count", () => {
    expect(checkFacts("Prix : 95 000 DT", [], f)).toEqual({ ok: false, unknown: ["95000"] });
    expect(checkFacts("Année 2022", [], f).unknown).toEqual(["2022"]);
    expect(checkFacts("moins de 50 000 km", [], f).unknown).toEqual(["50000"]);
    expect(checkFacts("5 places, 7 airbags", [], f).unknown).toEqual(["5", "7"]);
    expect(checkFacts("ok", ["#Golf2023"], f).unknown).toEqual(["2023"]);
    expect(checkFacts("السوم ٩٠٠٠٠", [], f).unknown).toEqual(["90000"]);
  });
});

describe("templates", () => {
  for (const [name, src] of [["voiture", car], ["location", rental], ["pièce", part]] as const) {
    for (const lang of ["fr", "tn"] as const) {
      for (const network of ["facebook", "instagram"] as const) {
        it(`${name} · ${lang} · ${network}: only the annonce's facts`, () => {
          const f = buildFacts(src);
          const d = templateDraft(f, network, lang);
          expect(checkFacts(d.body, d.hashtags, f)).toEqual({ ok: true, unknown: [] });
          expect(d.body).toContain(src.title);
          expect(d.hashtags).toContain("#MazedAuto");
        });
      }
    }
  }

  it("says the price per day for a rental, and its conditions", () => {
    const d = templateDraft(buildFacts(rental), "facebook", "fr");
    expect(d.body).toContain("75 DT / jour");
    expect(d.body).toContain("Caution : 500 TND");
  });

  it("puts the tagged link on Facebook, the reference on Instagram", () => {
    const fb = finalText("facebook", "Texte", ["#MazedAuto"], "https://x/fr/annonces/1?utm_source=facebook");
    expect(fb).toContain("utm_source=facebook");
    const ig = finalText("instagram", "Texte réf. MZ-1", ["#MazedAuto"], "https://x");
    expect(ig).not.toContain("https://");
  });
});

describe("Meta errors", () => {
  it("are sorted by what to do next", () => {
    expect(classify(400, { error: { code: 190, message: "expired" } }, false).kind).toBe("token");
    expect(classify(400, { error: { code: 4 } }, true).kind).toBe("rate");
    expect(classify(429, null, false).kind).toBe("rate");
    expect(classify(400, { error: { code: 100, message: "bad image" } }, true).kind).toBe("rejected");
    expect(classify(502, null, true).kind).toBe("ambiguous");
    expect(classify(502, null, false).kind).toBe("transient");
  });
});
