import { describe, expect, it } from "vitest";
import { DEFAULT_LISTING_RULES, readListingRules, toStoredListingRules } from "./listingRules";

/** D-B5: how long an annonce stays online and how many photos it carries, set in Réglages. */
describe("listing rules", () => {
  it("reads a missing or broken setting as what the site did before", () => {
    expect(readListingRules(null)).toEqual(DEFAULT_LISTING_RULES);
    expect(readListingRules({})).toEqual({ validityDays: 30, maxPhotos: 12 });
    expect(readListingRules({ validity_days: "abc", max_photos: null })).toEqual({ validityDays: 30, maxPhotos: 12 });
  });

  it("keeps the numbers inside their bounds", () => {
    expect(readListingRules({ validity_days: 2, max_photos: 0 })).toEqual({ validityDays: 7, maxPhotos: 1 });
    expect(readListingRules({ validity_days: 999, max_photos: 99 })).toEqual({ validityDays: 180, maxPhotos: 24 });
    expect(readListingRules({ validity_days: "45", max_photos: 8.6 })).toEqual({ validityDays: 45, maxPhotos: 9 });
  });

  it("round-trips through the stored shape", () => {
    const r = { validityDays: 60, maxPhotos: 20 };
    expect(toStoredListingRules(r)).toEqual({ validity_days: 60, max_photos: 20 });
    expect(readListingRules(toStoredListingRules(r))).toEqual(r);
  });
});
