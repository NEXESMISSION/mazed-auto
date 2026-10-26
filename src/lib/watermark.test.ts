import { describe, expect, it } from "vitest";
import { MARGIN_RATIO, MARK_WIDTH_RATIO, MIN_MARK_PX, cornerRect } from "./watermark";

/** The ring emblem is very nearly square (784x788). */
const RING = 788 / 784;

describe("cornerRect — where the watermark goes", () => {
  it("sits in the top-left corner, 13% of the width, inside a 3% margin", () => {
    const r = cornerRect(1600, 1200, RING);
    expect(r.x).toBe(Math.round(1200 * MARGIN_RATIO));
    expect(r.y).toBe(r.x);
    expect(r.w).toBe(Math.round(1600 * MARK_WIDTH_RATIO));
    expect(r.h).toBe(Math.round(r.w * RING));
  });

  it("takes the margin from the shorter side of a portrait photo", () => {
    const r = cornerRect(900, 1600, RING);
    expect(r.x).toBe(Math.round(900 * MARGIN_RATIO));
  });

  it("keeps a floor on a small upload", () => {
    expect(cornerRect(320, 240, RING).w).toBe(MIN_MARK_PX);
  });

  it("never draws past the edge of a tiny photo", () => {
    const r = cornerRect(60, 40, RING);
    expect(r.x + r.w).toBeLessThanOrEqual(60);
    expect(r.y + r.h).toBeLessThanOrEqual(40);
    expect(r.w).toBeGreaterThan(0);
  });
});
