import { describe, expect, it } from "vitest";
import {
  ROTATION_MINUTES,
  allocate,
  effectiveBoost,
  freshness,
  interest,
  jitter,
  rankListings,
  rotationSeed,
  score,
  type Rankable,
} from "./ranking";

const NOW = new Date("2026-09-05T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const row = (id: string, over: Partial<Rankable> = {}): Rankable => ({
  id,
  published_at: daysAgo(1),
  photoCount: 4,
  ...over,
});

describe("freshness", () => {
  it("decays by half every half-life, and never goes negative", () => {
    expect(freshness(daysAgo(0), NOW)).toBeCloseTo(1, 5);
    expect(freshness(daysAgo(10), NOW)).toBeCloseTo(0.5, 5);
    expect(freshness(daysAgo(20), NOW)).toBeCloseTo(0.25, 5);
    expect(freshness(daysAgo(365), NOW)).toBeGreaterThan(0);
  });

  it("has nothing to say about an unpublished listing", () => {
    expect(freshness(null, NOW)).toBe(0);
    expect(freshness("not a date", NOW)).toBe(0);
  });
});

describe("effectiveBoost", () => {
  it("applies while it lasts and stops when it lapses", () => {
    const live = row("a", { boost: 40, boost_until: new Date(NOW + 86_400_000).toISOString() });
    const lapsed = row("b", { boost: 40, boost_until: new Date(NOW - 1000).toISOString() });
    expect(effectiveBoost(live, NOW)).toBe(40);
    expect(effectiveBoost(lapsed, NOW)).toBe(0);
  });

  it("never expires without an end date", () => {
    expect(effectiveBoost(row("c", { boost: -20 }), NOW)).toBe(-20);
  });
});

describe("interest", () => {
  it("is log-scaled, so 400 views beats 40 without being ten times better", () => {
    const few = interest(row("a", { view_count: 40 }));
    const many = interest(row("b", { view_count: 400 }));
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThan(few * 3);
  });

  it("counts a contact reveal far above a view", () => {
    expect(interest(row("a", { contact_reveal_count: 1 })))
      .toBeGreaterThan(interest(row("b", { view_count: 5 })));
  });
});

describe("rotation", () => {
  it("is stable inside a bucket and moves between buckets", () => {
    const a = rotationSeed(NOW);
    const b = rotationSeed(NOW + (ROTATION_MINUTES - 1) * 60_000);
    const c = rotationSeed(NOW + (ROTATION_MINUTES + 1) * 60_000);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it("gives every listing a different, repeatable offset", () => {
    expect(jitter("x", 1)).toBe(jitter("x", 1));
    expect(jitter("x", 1)).not.toBe(jitter("y", 1));
    expect(jitter("x", 1)).not.toBe(jitter("x", 2));
  });

  it("actually reorders the page between buckets", () => {
    // Twenty equally fresh listings: rotation is the only thing separating
    // them, which is exactly the case the home page hits.
    const rows = Array.from({ length: 20 }, (_, i) => row(`id-${i}`, { published_at: daysAgo(5) }));
    const first = rankListings(rows, NOW, 1).map((r) => r.id);
    const later = rankListings(rows, NOW, 2).map((r) => r.id);
    expect(later).not.toEqual(first);
    expect([...later].sort()).toEqual([...first].sort()); // same set, new order
  });
});

describe("score", () => {
  it("lets a boost lift an older listing over a newer one", () => {
    const fresh = row("fresh", { published_at: daysAgo(0), boost: 0 });
    const boosted = row("boosted", { published_at: daysAgo(14), boost: 80 });
    expect(score(boosted, NOW, 0)).toBeGreaterThan(score(fresh, NOW, 0));
  });

  it("buries a negative boost without needing to unpublish it", () => {
    const normal = row("normal", { published_at: daysAgo(30) });
    const buried = row("buried", { published_at: daysAgo(0), boost: -100 });
    expect(score(buried, NOW, 0)).toBeLessThan(score(normal, NOW, 0));
  });

  it("does not let one input dominate: a stale boosted listing still loses to a fresh boosted one", () => {
    const stale = row("stale", { published_at: daysAgo(120), boost: 60 });
    const recent = row("recent", { published_at: daysAgo(1), boost: 60 });
    expect(score(recent, NOW, 0)).toBeGreaterThan(score(stale, NOW, 0));
  });

  it("prefers a listing with photographs", () => {
    const withPhotos = row("p", { photoCount: 6 });
    const barePhoto = row("q", { photoCount: 1 });
    expect(score(withPhotos, NOW, 0)).toBeGreaterThan(score(barePhoto, NOW, 0));
  });
});

describe("allocate", () => {
  const ranked = Array.from({ length: 10 }, (_, i) => row(`id-${i}`));

  it("gives each surface its own listings, never the same one twice", () => {
    const out = allocate(ranked, { cover: 3, runners: 2, rail: 4 });
    expect(out.cover).toHaveLength(3);
    expect(out.runners).toHaveLength(2);
    expect(out.rail).toHaveLength(4);
    const all = [...out.cover, ...out.runners, ...out.rail].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("comes up short rather than repeating when the catalogue is thin", () => {
    const out = allocate(ranked.slice(0, 4), { cover: 3, runners: 3 });
    expect(out.cover).toHaveLength(3);
    expect(out.runners).toHaveLength(1);
    const all = [...out.cover, ...out.runners].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });
});
