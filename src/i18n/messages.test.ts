import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { routing } from "./routing";
import { AREAS } from "./areas";

/**
 * Every language carries the same messages. A key missing from ar.json does
 * not fail the build — next-intl prints the key's path on the page instead —
 * so the gap would only show on an Arabic screen. This finds it first, and
 * checks that each translation keeps the original's {arguments} and <tags>
 * (a renamed `{count}` renders as nothing; a dropped `<link>` loses the link).
 */
type Tree = { [key: string]: string | Tree };

function load(file: string): Tree {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", file), "utf8"));
}

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(path, v);
    else for (const [p, s] of flatten(v, path)) out.set(p, s);
  }
  return out;
}

/** The {arguments} and <tags> of an ICU message, sorted. */
function slots(message: string): string[] {
  const args = [...message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)].map((m) => `{${m[1]}}`);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

const SETS = [
  { name: "core", file: (l: string) => `${l}.json` },
  ...AREAS.map((area) => ({ name: area, file: (l: string) => `${area}/${l}.json` })),
];

describe("messages", () => {
  it("has a file per area for every locale, and no folder that is not an area", () => {
    const dirs = readdirSync(join(process.cwd(), "messages")).filter((d) =>
      statSync(join(process.cwd(), "messages", d)).isDirectory(),
    );
    expect(dirs.sort()).toEqual([...AREAS].sort());
    for (const area of AREAS) for (const l of routing.locales) expect(() => load(`${area}/${l}.json`)).not.toThrow();
  });

  it("parses and renders every message in every language", () => {
    const broken: string[] = [];
    for (const set of SETS) {
      for (const locale of routing.locales) {
        const messages = load(set.file(locale));
        const t = createTranslator({ locale, messages, onError: (e) => { throw e; } });
        for (const [key, text] of flatten(messages)) {
          const values: Record<string, unknown> = {};
          for (const m of text.matchAll(/\{\s*(\w+)\s*(?:,\s*(\w+))?/g)) {
            values[m[1]] = m[2] === "plural" || m[2] === "selectordinal" || m[2] === "number" ? 3 : m[2] === "select" ? "other" : "x";
          }
          for (const m of text.matchAll(/<(\w+)>/g)) values[m[1]] = (chunks: unknown) => chunks;
          try {
            t.rich(key as never, values as never);
          } catch (e) {
            broken.push(`${set.file(locale)} ${key}: ${(e as Error).message.slice(0, 80)}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("keeps area namespaces out of the core file", () => {
    const core = load(`${routing.defaultLocale}.json`);
    expect(AREAS.filter((a) => a in core)).toEqual([]);
  });

  for (const set of SETS) {
    const reference = flatten(load(set.file(routing.defaultLocale)));
    for (const locale of routing.locales.filter((l) => l !== routing.defaultLocale)) {
      const other = flatten(load(set.file(locale)));

      it(`${set.name}: ${locale} has exactly the keys of ${routing.defaultLocale}`, () => {
        expect([...other.keys()].filter((k) => !reference.has(k))).toEqual([]);
        expect([...reference.keys()].filter((k) => !other.has(k))).toEqual([]);
      });

      it(`${set.name}: ${locale} keeps every {argument} and <tag>`, () => {
        const mismatches = [...reference]
          .filter(([k, v]) => other.has(k) && slots(v).join() !== slots(other.get(k)!).join())
          .map(([k, v]) => `${k}: ${slots(v).join(" ")} ≠ ${slots(other.get(k)!).join(" ")}`);
        expect(mismatches).toEqual([]);
      });

      it(`${set.name}: ${locale} writes counts with the argument, not #`, () => {
        // `#` goes through the locale's number format, which in some browsers
        // gives Arabic-Indic digits for "ar"; prices, dates and plates are in
        // Western digits, so counts must be too. Use `{count}` in the branch.
        expect([...other].filter(([, v]) => /#/.test(v)).map(([k]) => k)).toEqual([]);
      });

      it(`${set.name}: ${locale} is not left in ${routing.defaultLocale}`, () => {
        // Brand names, units and codes are the same in every language; a
        // sentence identical to the French one is a translation that was
        // forgotten.
        const untranslated = [...reference]
          .filter(([k, v]) => other.get(k) === v && /\p{Ll}{3,}\s+\p{Ll}{2,}/u.test(v))
          .map(([k]) => k);
        expect(untranslated).toEqual([]);
      });
    }
  }
});
