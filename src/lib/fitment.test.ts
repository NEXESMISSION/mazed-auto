import { describe, it, expect } from "vitest";
import { fitmentMatches, listingIdsMatching, normalizeFitmentText } from "./fitment";

const clio5 = { make: "Renault", model: "Clio 5", yearFrom: 2019, yearTo: 2024 };

describe("fitmentMatches", () => {
  it("matches the query it exists for: Clio 5, 2020", () => {
    expect(fitmentMatches(clio5, { make: "Renault", model: "Clio 5", year: 2020 })).toBe(true);
  });

  it("is case- and accent-insensitive on the make", () => {
    expect(fitmentMatches({ ...clio5, make: "Citroën" }, { make: "citroen", year: 2020 })).toBe(true);
    expect(fitmentMatches(clio5, { make: "RENAULT", year: 2020 })).toBe(true);
  });

  it("rejects a different make outright", () => {
    expect(fitmentMatches(clio5, { make: "Peugeot", year: 2020 })).toBe(false);
  });

  it("matches a model in either direction — sellers and buyers write it differently", () => {
    // Seller more specific than the buyer…
    expect(fitmentMatches({ ...clio5, model: "Clio 5 Business" }, { make: "Renault", model: "Clio 5" })).toBe(true);
    // …and the other way round.
    expect(fitmentMatches(clio5, { make: "Renault", model: "Clio 5 Business" })).toBe(true);
  });

  it("does not match a model the row does not carry", () => {
    expect(fitmentMatches(clio5, { make: "Renault", model: "Captur" })).toBe(false);
    expect(fitmentMatches({ ...clio5, model: null }, { make: "Renault", model: "Clio 5" })).toBe(false);
  });

  it("keeps the year inside the range, edges included", () => {
    expect(fitmentMatches(clio5, { make: "Renault", year: 2019 })).toBe(true);
    expect(fitmentMatches(clio5, { make: "Renault", year: 2024 })).toBe(true);
    expect(fitmentMatches(clio5, { make: "Renault", year: 2018 })).toBe(false);
    expect(fitmentMatches(clio5, { make: "Renault", year: 2025 })).toBe(false);
  });

  it("treats an open end as 'and later' / 'and earlier'", () => {
    // How a parts catalog is actually written: "à partir de 2019".
    expect(fitmentMatches({ ...clio5, yearTo: null }, { make: "Renault", year: 2030 })).toBe(true);
    expect(fitmentMatches({ ...clio5, yearFrom: null }, { make: "Renault", year: 1999 })).toBe(true);
  });

  it("ignores a year the buyer left out or typed as nonsense", () => {
    expect(fitmentMatches(clio5, { make: "Renault" })).toBe(true);
    expect(fitmentMatches(clio5, { make: "Renault", year: "abcd" })).toBe(true);
    expect(fitmentMatches(clio5, { make: "Renault", year: 12 })).toBe(true);
  });

  it("matches everything when the query is empty", () => {
    expect(fitmentMatches(clio5, {})).toBe(true);
  });
});

describe("listingIdsMatching", () => {
  it("returns each listing once, however many of its fitments match", () => {
    const rows = [
      { listingId: "a", ...clio5 },
      { listingId: "a", make: "Renault", model: "Captur", yearFrom: 2020, yearTo: 2024 },
      { listingId: "b", make: "Dacia", model: "Sandero", yearFrom: 2021, yearTo: 2024 },
    ];
    expect(listingIdsMatching(rows, { make: "Renault", year: 2022 })).toEqual(["a"]);
    expect(listingIdsMatching(rows, { make: "Dacia", year: 2022 })).toEqual(["b"]);
    expect(listingIdsMatching(rows, { make: "Renault", year: 2019 })).toEqual(["a"]);
  });

  it("returns nothing rather than everything when nothing fits", () => {
    // The catalog page turns an empty result into "no results"; returning all
    // ids here would silently show the buyer parts for the wrong car.
    expect(listingIdsMatching([{ listingId: "a", ...clio5 }], { make: "Toyota" })).toEqual([]);
  });
});

describe("normalizeFitmentText", () => {
  it("folds accents, case and punctuation", () => {
    expect(normalizeFitmentText("Citroën  C3-Aircross")).toBe("citroen c3 aircross");
  });
});
