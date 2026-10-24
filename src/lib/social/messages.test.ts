import { describe, expect, it } from "vitest";
import fr from "../../../messages/social/fr.json";
import ar from "../../../messages/social/ar.json";

/**
 * D-S5: the Social Publisher screens exist in French and Arabic from the
 * start. Same keys in both, and the same {placeholders} in each text — a
 * missing key or a dropped {count} would show up as a raw key or a broken
 * sentence the day Arabic is switched on.
 */
type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

// A placeholder is {name} or {name, plural…}; « {Aucune photo} » is the text of a branch.
const args = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("Social Publisher messages", () => {
  const f = flatten(fr as Tree);
  const a = flatten(ar as Tree);

  it("have the same keys in French and Arabic", () => {
    expect(Object.keys(a).sort()).toEqual(Object.keys(f).sort());
  });

  it("use the same placeholders in both", () => {
    for (const k of Object.keys(f)) expect([k, args(a[k] ?? "")]).toEqual([k, args(f[k])]);
  });

  it("are actually translated", () => {
    const same = Object.keys(f).filter((k) => f[k] === a[k] && !/Social Publisher/.test(f[k]));
    expect(same).toEqual([]);
  });
});
