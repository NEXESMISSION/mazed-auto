import { describe, it, expect } from "vitest";
import { rentalConditionRows, sanitizeRentalAttributes } from "./rental";

/**
 * Recette 3: a rental is a price per day, conditions and a DECLARED
 * availability — never a booking calendar.
 */

describe("sanitizeRentalAttributes", () => {
  it("keeps well-formed rental keys and every other attribute untouched", () => {
    expect(sanitizeRentalAttributes({
      make: "Kia", year: 2022,
      rental_deposit: "500", rental_min_age: 21, rental_license_years: "2",
      rental_km_per_day: 250, rental_availability: "available", rental_terms: "  Carburant à rendre plein. ",
    })).toEqual({
      make: "Kia", year: 2022,
      rental_deposit: 500, rental_min_age: 21, rental_license_years: 2,
      rental_km_per_day: 250, rental_availability: "available", rental_terms: "Carburant à rendre plein.",
    });
  });

  it("drops typos instead of guessing", () => {
    expect(sanitizeRentalAttributes({
      rental_deposit: -5, rental_min_age: 12, rental_availability: "tomorrow at 3pm",
    })).toEqual({});
  });

  it("has no calendar to store: dates are not rental keys", () => {
    const out = sanitizeRentalAttributes({ rental_dates: ["2026-11-01"], rental_calendar: {} });
    // Unknown keys pass through as ordinary attributes, but nothing reads them
    // as availability: availability is only « available » or « on_request ».
    expect(out.rental_availability).toBeUndefined();
  });
});

describe("rentalConditionRows", () => {
  it("says the conditions in words, in a fixed order", () => {
    expect(rentalConditionRows({
      rental_km_per_day: 0, rental_deposit: 800, rental_availability: "on_request",
      rental_min_age: 23, rental_license_years: 3,
    })).toEqual([
      { label: "Disponibilité", value: "Sur demande" },
      { label: "Caution", value: "800 TND" },
      { label: "Âge minimum", value: "23 ans" },
      { label: "Permis depuis", value: "3 ans" },
      { label: "Kilométrage inclus", value: "Illimité" },
    ]);
  });

  it("is empty for an annonce with no rental conditions", () => {
    expect(rentalConditionRows({ make: "Kia" })).toEqual([]);
    expect(rentalConditionRows(null)).toEqual([]);
  });
});
