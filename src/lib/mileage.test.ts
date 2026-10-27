import { describe, expect, it } from "vitest";
import { MAX_MILEAGE, mileageOk, withoutBadMileage } from "./mileage";

describe("mileage", () => {
  it("accepts an empty field and whole kilometres in range", () => {
    expect(mileageOk("")).toBe(true);
    expect(mileageOk(undefined)).toBe(true);
    expect(mileageOk("0")).toBe(true);
    expect(mileageOk("120000")).toBe(true);
    expect(mileageOk(String(MAX_MILEAGE))).toBe(true);
  });

  it("refuses negative, fractional, absurd or non-numeric values", () => {
    expect(mileageOk("-5000")).toBe(false);
    expect(mileageOk(-1)).toBe(false);
    expect(mileageOk("12.5")).toBe(false);
    expect(mileageOk(String(MAX_MILEAGE + 1))).toBe(false);
    expect(mileageOk("beaucoup")).toBe(false);
  });

  it("drops only a bad mileage from the attributes", () => {
    expect(withoutBadMileage({ make: "Kia", mileage: "-5000" })).toEqual({ make: "Kia" });
    expect(withoutBadMileage({ make: "Kia", mileage: "80000" })).toEqual({ make: "Kia", mileage: "80000" });
    expect(withoutBadMileage({ make: "Kia" })).toEqual({ make: "Kia" });
  });
});
