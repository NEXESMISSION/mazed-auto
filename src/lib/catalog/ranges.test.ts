import { describe, expect, it } from "vitest";
import { ordered, rangeProblems } from "./ranges";

const none = { min: "", max: "", year_min: "", year_max: "" };

describe("catalogue ranges", () => {
  it("flags a budget whose minimum is above its maximum", () => {
    expect(rangeProblems({ ...none, min: "100000", max: "10000" })).toEqual(["price"]);
    expect(rangeProblems({ ...none, min: "10000", max: "100000" })).toEqual([]);
    expect(rangeProblems({ ...none, min: "100000" })).toEqual([]);
  });

  it("flags reversed years, but only once both have four digits", () => {
    expect(rangeProblems({ ...none, year_min: "2025", year_max: "2020" })).toEqual(["year"]);
    expect(rangeProblems({ ...none, year_min: "2025", year_max: "20" })).toEqual([]);
    expect(rangeProblems({ ...none, year_min: "2020", year_max: "2020" })).toEqual([]);
  });

  it("puts two bounds the right way round", () => {
    expect(ordered(100000, 10000)).toEqual([10000, 100000]);
    expect(ordered(5, null)).toEqual([5, null]);
    expect(ordered(1, 2)).toEqual([1, 2]);
  });
});
