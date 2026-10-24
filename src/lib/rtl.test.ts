import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { localeDirection } from "@/i18n/routing";

/**
 * Arabic is on (/ar), and pages are written with logical properties, so they
 * mirror by themselves in a right-to-left locale. This keeps it that way — a
 * physical left/right class in these folders fails here, with its file and
 * line. `rtl:` / `ltr:` variants are allowed: they exist precisely to say « on
 * this side in that direction ».
 *
 * Every page and component is covered, the admin console included. Comment
 * lines are skipped: « right-hand column » is prose, not a class.
 */
const ROOTS = ["src/app/[locale]", "src/components"];

const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*|\{\/\*)/;

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

  it("keeps physical left/right classes out of every page and component", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => files(join(process.cwd(), r)))) {
      let inBlock = false;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const opens = line.lastIndexOf("/*") > line.lastIndexOf("*/");
        const skip = inBlock || COMMENT_LINE.test(line);
        if (inBlock && line.includes("*/")) inBlock = false;
        if (opens) inBlock = true;
        if (skip) return;
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
