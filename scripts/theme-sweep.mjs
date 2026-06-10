// One-shot: replace hardcoded light/blue/gray Tailwind classes + hex literals
// with black+gold tokens across src/. Token-level, ordered specific->generic.
// Safe because these classes have no legitimate use on the dark theme.
// (text-white, bg-black, bg-red-*, text-red-* are intentionally NOT touched.)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "src");
const EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

const RULES = [
  // indicator dots that must stay visible (would vanish if -> bg-surface)
  [/rounded-full bg-white text-white\/40/g, "rounded-full bg-gold text-gold/40"],
  // hairline borders drawn with black opacity
  [/border-black\/\[0?\.\d+\]/g, "border-border"],
  // white frosted/elevated backgrounds (high opacity) and other opacities
  [/bg-white\/(?:100|9\d|8\d|7\d)/g, "bg-surface/80"],
  [/bg-white\/\d+/g, "bg-surface/40"],
  [/\bbg-white\b/g, "bg-surface"],
  // light surfaces
  [/\bbg-(?:zinc|gray|slate|neutral)-(?:50|100)\b/g, "bg-surface-2"],
  [/\bbg-(?:zinc|gray|slate|neutral)-200\b/g, "bg-surface-3"],
  // dark text -> light foreground
  [/\btext-(?:zinc|gray|slate)-(?:800|900)\b/g, "text-foreground"],
  [/\btext-black\b/g, "text-foreground"],
  // mid-gray text -> muted
  [/\btext-(?:zinc|gray|slate)-(?:500|600|700)\b/g, "text-muted"],
  // light borders
  [/\bborder-(?:zinc|gray|slate)-(?:100|200|300)\b/g, "border-border"],
  // blue brand -> gold
  [/\bbg-blue-(?:400|500|600|700)\b/g, "bg-gold"],
  [/\btext-blue-(?:500|600|700)\b/g, "text-gold"],
  [/\bborder-blue-(?:300|400|500|600|700)\b/g, "border-gold"],
  [/\bring-blue-(?:400|500|600|700)\b/g, "ring-gold"],
  // white rings/tints on dark
  [/\bring-white\/\d+/g, "ring-gold/20"],
  // inline hex literals: blue avatars, navy ring, old gold
  [/#3b82f6/g, "#d4af37"],
  [/#6366f1/g, "#b8941f"],
  [/#0ea5e9/g, "#e8c668"],
  [/#8b5cf6/g, "#8a6d18"],
  [/#0d1b3d/g, "#141414"],
  [/#c9a227/g, "#d4af37"],
  // broken class string left by the light redesign
  [/bg-batta-surface-2 text-batta-gold/g, "bg-surface-2 text-gold"],
];

let filesChanged = 0, total = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(p))) continue;
    const orig = readFileSync(p, "utf8");
    let out = orig, n = 0;
    for (const [re, rep] of RULES) out = out.replace(re, () => { n++; return rep; });
    if (out !== orig) { writeFileSync(p, out); filesChanged++; total += n; console.log(`  ${p.replace(ROOT, "src")}: ${n}`); }
  }
}
walk(ROOT);
console.log(`\nDONE: ${total} replacements across ${filesChanged} files.`);
