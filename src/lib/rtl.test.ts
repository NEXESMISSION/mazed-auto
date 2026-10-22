import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { localeDirection } from "@/i18n/routing";

/**
 * Arabic preparation (brief, recette 15): the shop pages are written with
 * logical properties, so they mirror by themselves once a right-to-left locale
 * is switched on. This keeps it that way — a physical left/right class in these
 * folders fails here, with its file and line. `rtl:` / `ltr:` variants are
 * allowed: they exist precisely to say « on this side in that direction ».
 *
 * The rest of the site predates this rule and is not checked; translating and
 * mirroring it is outside the shops brief.
 */
const ROOTS = [
  "src/app/[locale]/pro",
  "src/app/[locale]/boutiques",
  "src/app/[locale]/admin/boutiques",
  "src/components/shops",
  "src/components/i18n",
];

const PHYSICAL = [
  /^-?(?:ml|mr|pl|pr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-/,
  /^text-(?:left|right)$/,
  /^rounded-(?:l|r|tl|tr|bl|br)(?:-|$)/,
  /^border-(?:l|r)(?:-|$)/,
  /^(?:float|clear)-(?:left|right)$/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe("RTL preparation", () => {
  it("derives the direction from the locale", () => {
    expect(localeDirection("fr")).toBe("ltr");
    expect(localeDirection("ar")).toBe("rtl");
  });

  it("keeps physical left/right classes out of the shop pages", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => files(join(process.cwd(), r)))) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const token of line.split(/[\s"'`{}()<>,;]+/)) {
          if (!token || /(?:^|:)(?:rtl|ltr):/.test(token)) continue;
          const utility = token.split(":").pop() ?? "";
          if (PHYSICAL.some((re) => re.test(utility))) {
            offenders.push(`${relative(process.cwd(), file)}:${i + 1}  ${token}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
