// Next 16's eslint-config-next ships native ESLint flat-config arrays, so we
// import them directly instead of bridging the legacy .eslintrc format through
// FlatCompat (@eslint/eslintrc). The FlatCompat path crashes on this toolchain
// ("Converting circular structure to JSON" while validating the next/react
// plugin configs); the native flat configs sidestep that entirely.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Tailwind's default palette, as a class-name fragment. These are light-mode
// swatches; the console is a #0a0a0a surface, so `bg-red-50` renders as a pale
// pink block and `text-amber-700` is unreadable on it. Matched in both plain
// string literals and template literals, since half the console's class names
// are built by interpolation.
const PALETTE_RE =
  "(^|[\\s'\"`])(bg|text|ring|border|from|to|via|divide|outline|decoration|shadow|accent|fill|stroke|caret|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)([^0-9]|$)";

const PALETTE_MESSAGE =
  "Admin is dark-themed: use a theme token (StatusPill / TONE_CLASS / var(--…)) instead of a Tailwind palette class.";

const NO_LIGHT_PALETTE = [
  { selector: `Literal[value=/${PALETTE_RE}/]`, message: PALETTE_MESSAGE },
  { selector: `TemplateElement[value.raw=/${PALETTE_RE}/]`, message: PALETTE_MESSAGE },
];

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    linterOptions: {
      // Some disable directives went stale when the rule set changed; surface
      // them as warnings to clean up over time rather than hard-failing CI.
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // react-hooks v7 (bundled with Next 16) adds brand-new ADVISORY rules
      // with high false-positive rates on valid, shipped patterns — the
      // mount-effect setState idiom, reading a ref/Date during render for a
      // transition, etc. Keep them visible as warnings instead of blocking
      // CI; we revisit them case-by-case rather than mass-rewriting working
      // hooks (which risks real regressions for a debatable lint opinion).
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // Next performance advisories — real, but not correctness. The handful
      // of raw <a>/<img> uses are deliberate (error/not-found pages that must
      // hard-navigate, blob-URL image previews).
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
      // The French/Arabic UI copy is full of apostrophes and quotes; escaping
      // them in JSX hurts readability for zero user-facing benefit.
      "react/no-unescaped-entities": "off",
      // Allow intentionally-unused args/vars when prefixed with "_".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The admin console is a dark surface (#0a0a0a). Tailwind's default
    // palette classes are light-mode swatches: `bg-red-50` renders as a pale
    // pink block on near-black, and `text-amber-700` is unreadable on it.
    // There were 84 of them across the console, which is most of the reason
    // it looked broken rather than merely dense.
    //
    // Tones come from the theme tokens instead — via <StatusPill>, the
    // `TONE_CLASS` map, or an arbitrary value like `text-[#e0a029]` when a
    // one-off is genuinely needed. Arbitrary values are deliberately still
    // allowed: the rule is "don't reach for the light-mode palette", not
    // "don't write colours".
    // Error inside the kit and every screen already rebuilt on it — these
    // start clean and must stay clean.
    files: [
      "src/components/admin/kit/**/*.{ts,tsx}",
      "src/components/admin/AdminShell.tsx",
      "src/app/**/admin/page.tsx",
      "src/app/**/admin/site/**/*.{ts,tsx}",
    ],
    rules: { "no-restricted-syntax": ["error", ...NO_LIGHT_PALETTE] },
  },
  {
    // The count reached zero — Diffusions, Popups and the legal-docs editor
    // were the last 18 — so this is now an error, as planned. The light-mode
    // swatches were not merely untidy: `bg-emerald-50 text-emerald-900` renders
    // a near-white block on a #0a0a0a ground, and `text-red-700` on the same
    // ground fails contrast outright. Erroring is what stops them coming back
    // one convenient copy-paste at a time.
    files: ["src/components/admin/**/*.{ts,tsx}", "src/app/**/admin/**/*.{ts,tsx}"],
    ignores: [
      "src/components/admin/kit/**",
      "src/components/admin/AdminShell.tsx",
      "src/app/**/admin/page.tsx",
      "src/app/**/admin/site/**",
    ],
    rules: { "no-restricted-syntax": ["error", ...NO_LIGHT_PALETTE] },
  },
  {
    // `.next-verify` is the isolated output of a verification build (see
    // distDir in next.config.ts). Like `.next` it is generated code, and
    // linting it produced ~600KB of errors about Next's own bundles.
    ignores: [".next/**", ".next-verify/**", "node_modules/**", "desing/**", "scripts/**"],
  },
];

export default eslintConfig;
