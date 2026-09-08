import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HomeDesktop } from "@/components/landing/HomeDesktop";
import { BrandRail } from "@/components/landing/BrandRail";
import { AnnonceRail } from "@/components/landing/AnnonceRail";
import { AnnonceCoverMobile } from "@/components/landing/AnnonceHero";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PerfProbe } from "@/components/dev/PerfProbe";

// Statically render + ISR-revalidate every 60s. The home page is the same
// for everyone (public catalogue); per-user bits (saved hearts, login state)
// are filled in client-side via the watchlist store after hydration. This
// lets Vercel serve the page straight from the edge CDN — ~20ms TTFB and no
// serverless cold start — instead of rendering ~200 cards on every request.
/**
 * How many published annonces each make has — the number in the corner of
 * every brand tile.
 *
 * The badge markup has been in BrandRail all along, but the counts fed to it
 * were derived from the auction feeds (`trending`, `nouveautes`, `offers`,
 * `recent`) by splitting each lot TITLE on its first word. Those arrays are
 * empty since the pivot, so every tile scored 0 and the badge never rendered:
 * a wall of logos with no indication that half of them have nothing behind
 * them.
 *
 * Counted from `attributes->>make` on published listings — the same field the
 * catalogue filters on — so the badge and the results agree.
 */
const fetchMakeCounts = unstable_cache(
  async (): Promise<{ name: string; count: number }[]> => {
    const admin = getServiceSupabase();
    if (!admin) return [];
    const { data } = await admin
      .from("listings")
      .select("attributes->>make")
      .eq("status", "published")
      .limit(5000);
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { make: string | null }[]) {
      const make = (row.make ?? "").trim();
      if (make) counts.set(make, (counts.get(make) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  },
  ["home-make-counts"],
  { revalidate: 300, tags: ["home-feed"] },
);

export const revalidate = 60;
import { ArrowUpRight, Gavel, Search, ShieldCheck, ClipboardCheck, Scale, Lock, Sparkles } from "lucide-react";

// Home data layer (getHomeFeed + selects + feed types) lives in
// "@/lib/home/feed" so this route file stays render-focused.

/**
 * Landing page — black + gold dark mode, design language ported from
 * the mazed-auto home feed. Every section is grouped under a
 * `SectionDivider` (gradient hairline → icon chip → eyebrow → bold
 * Jakarta title) so the page reads as a structured feed instead of a
 * loose stack of cards.
 */
// "How it works" — 3-step buyer journey strip. Defined ABOVE
// LandingPage to dodge the Turbopack-RSC hoister bug (same reason
// StatTile lived up top): module `const` declarations defined AFTER
// the long LandingPage body sometimes fail to resolve at
// server-render time in dev.
const HOW_IT_WORKS: {
  key: string;
  eyebrowKey: string;
  titleKey: string;
  bodyKey: string;
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  {
    key: "browse", eyebrowKey: "home.step1Eyebrow",
    titleKey: "home.step1Title", bodyKey: "home.step1Body",
    href: "/annonces", Icon: Search,
  },
  {
    key: "bid", eyebrowKey: "home.step3Eyebrow",
    titleKey: "home.step3Title", bodyKey: "home.step3Body",
    href: "/properties", Icon: Gavel,
  },
];

// Trust pillars — what protects the user. Anchored to the four platform
// guarantees already enforced by the server code (escrow, KYC gate,
// inspection workflow, Tunisian-law surenchère + delays).
const TRUST_PILLARS: {
  key: string;
  titleKey: string;
  bodyKey: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { key: "escrow",     titleKey: "home.trustEscrowTitle",     bodyKey: "home.trustEscrowBody",     Icon: Lock },
  { key: "kyc",        titleKey: "home.trustKycTitle",        bodyKey: "home.trustKycBody",        Icon: ShieldCheck },
  // Only claim the inspection guarantee while there is an inspector network
  // to back it — promising an independent expert report we can't deliver is
  // worse than not mentioning it.
  ...(false
    ? [{ key: "inspection", titleKey: "home.trustInspectionTitle", bodyKey: "home.trustInspectionBody", Icon: ClipboardCheck }]
    : []),
  { key: "legal",      titleKey: "home.trustLegalTitle",      bodyKey: "home.trustLegalBody",      Icon: Scale },
];

// `Sparkles` is imported for a planned featured-tag pass and isn't
// referenced yet; touch it here so the strict-import lint stays happy.
const _sparklesKeepAlive = Sparkles;
void _sparklesKeepAlive;


export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Required for static rendering with next-intl — must run before any
  // getTranslations/getLocale call, or next-intl falls back to dynamic.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const isRTL = locale === "ar";
  // Both device trees are rendered and CSS picks one (lg breakpoint). The
  // page is static, so saved-hearts + login state stay false here and the
  // client watchlist store fills them in after hydration.

  // THE AUCTION DATA PHASE STOOD HERE.
  //
  // It called `getHomeFeed`, which fired six queries at `auctions` joined to
  // `properties` — both empty since the pivot — and handed the results to
  // rails that `AUCTIONS_VISIBLE` had already switched off. Six round trips per
  // cache miss, on the site's most-requested page, for markup nobody could see.
  //
  // The catalogue rails below (`AnnonceRail`) do their own reads and always
  // did. That is why the page kept working while this quietly fetched nothing,
  // and why removing it changes what a visitor sees not at all.

  // "Parcourir par marque" and the makes figure in the stats bar. Both used to
  // be derived by splitting auction lot TITLES on their first word, across
  // feeds that are empty since the pivot — see fetchMakeCounts.
  const makeCounts = await fetchMakeCounts();

  // `hotNow`, `vip` and `endingSoonSlides` were derived here from that feed:
  // bid counts, `promo_home_featured`, and the lots closest to closing. A
  // fixed-price catalogue has none of those three, and the rails they fed were
  // already off.

  return (
    <>
    {/* Client-side perf probe — logs nav/paint/LCP/long-task/resource
        timings to the browser console (scope `perf`). Dev-only unless
        NEXT_PUBLIC_PERF_PROBE=1. Renders nothing. */}
    <PerfProbe tag="home" />
    {/* ════════════════════════════════════════════════════════════════
        MOBILE / TABLET TREE (< lg) — CSS-gated with `lg:hidden`; the
        desktop tree below is `hidden lg:block`. Both are rendered so the
        page stays static (no server-side device detection); CSS picks one.
        ════════════════════════════════════════════════════════════════ */}
    <div className="lg:hidden mx-auto max-w-[var(--max-w)]">
      {/* ───── PROMO HERO ─────
          The v1 mobile hero: an auto-cycling value-prop carousel (live
          bidding, verified sellers, secured deposit, 3% commission, ratings)
          laid over real live-auction photos, with gold accents + a top
          progress bar. Replaces the brand/stat HeroBanner on phones — leads
          with cars + trust, which reads sharper. */}
      {/* THE COVER, on phones. Was two pieces: a carousel of photographs with
          no words on them, then the featured card. So the sentence that says
          what Mazed is — the headline the desktop opens with — never reached
          the readers who are most of the traffic. One block now, carrying the
          same content as the desktop spread in a layout meant for a phone. */}
      <AnnonceCoverMobile />

      {/* LIVE TICKER — streamed in its own Suspense boundary so the page
          shell + hero paint immediately instead of blocking on this query. */}
      

      {/* ══════════════════════════════════════════════════════════════
          BROWSE — the page's center of gravity. Trending rail on top
          (auto-rotating, 8 cards), live-activity feed slipped under,
          coverage strip, then a 2-col grid of the next batch. No
          repeated rail headers, no marketing-section dividers between
          listings — the cards themselves carry the page.
          ══════════════════════════════════════════════════════════════ */}

      {/* ── ANNONCES (v3) ──
          The catalog leads the page: fixed-price cars and spare parts, where
          the buyer calls the seller. The auction blocks below stay for the lots
          still running and retire with them (PIVOT-PLAN.md Phase 6). Each rail
          renders nothing when its side of the catalog is empty, so this section
          grows in as sellers publish rather than showing an empty shelf. */}
      <AnnonceRail
        kind="vehicle"
        eyebrow="À vendre"
        title="Voitures à prix fixe"
        subtitle="Vous contactez le vendeur directement"
        locale={locale}
      />
      <AnnonceRail
        kind="part"
        eyebrow="Pièces de rechange"
        title="Pièces disponibles"
        subtitle="Trouvez la pièce compatible avec votre véhicule"
        locale={locale}
      />

      {/* ── v2 AUCTION BLOCKS ──
          Hidden with AUCTIONS_VISIBLE (see src/lib/features.ts): the live
          ticker, the bid rails, "Enchères en cours", the ending-soon hero
          and the activity feed. A visitor should not be invited into a
          product we no longer sell. The lots still running stay reachable
          by direct link; Phase 6 deletes this whole region. */}
      

      {/* "Parcourir par type" / "Parcourir par prix" used to sit here. Both
          linked into /properties with filter query strings — the v2 explore
          grid, which now only 307s to /annonces and drops the filter on the
          way. Two rails of taps that all land on the same unfiltered page is
          worse than not offering them. */}

      {/* Recently hammered — actual sold prices. Horizontal scroll rail
          so any count of real cards looks intentional (1 card scrolls,
          12 cards scroll). No padded placeholders: a "Coming soon"
          tile alongside a real sold listing reads as filler and makes
          the page feel emptier than just hiding the section would. */}
      
      

      {/* Brand wall — full logo grid of every make, each tile deep-linking into
          Explore filtered by that brand (see BrandRail + src/lib/brands.ts). */}
      <BrandRail makes={makeCounts} title="Parcourir par marque" />

      <section className="mt-10">
        <div className="px-4">
          <span className="batta-eyebrow">{t("home.howItWorksEyebrow")}</span>
          <h3
            className={`mt-1.5 text-[19px] font-extrabold leading-tight tracking-tight ${
              isRTL ? "font-arabic" : ""
            }`}
          >
            {t("home.howItWorksTitle")}
          </h3>
        </div>
        <div className="snap-rail hide-scrollbar mt-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible">
          {HOW_IT_WORKS.map((step, i) => (
            <Link
              key={step.key}
              href={step.href as never}
              className="batta-frame group flex w-[260px] shrink-0 snap-start flex-col gap-3 rounded-2xl p-5 transition active:scale-[0.99] hover:ring-gold-soft/50 lg:w-auto"
            >
              <div className="flex items-center gap-3">
                <span className="batta-monogram batta-monogram-filled size-10 text-[15px]">
                  <step.Icon className="size-4" strokeWidth={2.2} />
                </span>
                <span className="batta-tabular text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold">
                  {String(i + 1).padStart(2, "0")} · {t(step.eyebrowKey)}
                </span>
              </div>
              <div>
                <div
                  className={`text-[15.5px] font-bold leading-tight text-foreground ${
                    isRTL ? "font-arabic" : ""
                  }`}
                >
                  {t(step.titleKey)}
                </div>
                <p
                  className={`mt-1 text-[12px] leading-relaxed text-muted ${
                    isRTL ? "font-arabic" : ""
                  }`}
                >
                  {t(step.bodyKey)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Trust strip — what protects the buyer (and the seller).
              Same horizontal-rail rhythm as the rest of the page so it
              reads as one more rich band, not a marketing block. Four
              short cards with a gold ring + brief copy; the surfaces
              they reference (escrow, KYC, inspection, legal) are the
              same ones already enforced by the platform code. */}
      <section className="mt-10">
        <div className="px-4">
          <span className="batta-eyebrow">{t("home.trustEyebrow")}</span>
          <h3
            className={`mt-1.5 text-[19px] font-extrabold leading-tight tracking-tight ${
              isRTL ? "font-arabic" : ""
            }`}
          >
            {t("home.trustTitle")}
          </h3>
        </div>
        {/* Column count follows the pillar count so dropping the inspection
            pillar doesn't leave a hole in the desktop grid. */}
        <div
          className={`snap-rail hide-scrollbar mt-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:grid lg:gap-4 lg:overflow-visible ${
            TRUST_PILLARS.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
          }`}
        >
          {TRUST_PILLARS.map((p) => (
            <div
              key={p.key}
              className="batta-surface-navy-luxe relative flex w-[230px] shrink-0 snap-start flex-col gap-2.5 overflow-hidden rounded-2xl p-5 ring-1 ring-gold/25 lg:w-auto"
            >
              <span className="batta-monogram size-10 shrink-0 text-gold">
                <p.Icon className="size-4" strokeWidth={2.2} />
              </span>
              <div
                className={`text-[14px] font-bold leading-tight text-foreground ${
                  isRTL ? "font-arabic" : ""
                }`}
              >
                {t(p.titleKey)}
              </div>
              <p
                className={`text-[11.5px] leading-relaxed text-muted ${
                  isRTL ? "font-arabic" : ""
                }`}
              >
                {t(p.bodyKey)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final browse band.
          Mobile: the original single-line nav band — compact, finger-
          sized chevron on the right.
          Desktop (lg+): a two-up magazine spread — large eyebrow + huge
          gradient headline + slogan on the left, three numbered
          shortcut links on the right (enchères / offres directes /
          inspections). Closes the page with the same "what can I do
          here" question the hero opens with, answered concretely. */}
      <section className="mt-10 px-4 lg:px-6">
        {/* One row, one destination.
            It was a gold-ringed panel: an eyebrow, the word « Voitures » in
            gradient gold, the slogan « Transparence. Rapidité. Confiance. »,
            and a glowing gold disc. Four elements to say "tap here for the
            catalogue" — and the slogan is the kind of line every classifieds
            site prints, which means it distinguishes nothing and is read by
            nobody. */}
        <Link
          href={"/annonces" as never}
          className="tap-target flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 transition active:scale-[0.99] lg:hidden"
        >
          <span className="min-w-0">
            <span className={`block text-[15px] font-bold text-foreground ${isRTL ? "font-arabic" : ""}`}>
              Parcourir le catalogue
            </span>
            <span className="mt-0.5 block text-[12.5px] text-subtle">
              Toutes les voitures et pi&egrave;ces en ligne
            </span>
          </span>
          <ArrowUpRight className="size-5 shrink-0 text-muted" strokeWidth={2.2} />
        </Link>

        {/* Desktop spread. Not a duplicate of the mobile band — different
            information density. Left column closes the brand pitch, right
            column gives the user three concrete next-action shortcuts so
            the page doesn't bottom-out on a single link. */}
        <div className="hidden lg:block">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface">
            <div className="relative grid grid-cols-12 gap-8 px-10 py-12">
              <div className="col-span-7">
                <span className="batta-eyebrow text-[10.5px]">
                  {t("brand.slogan")}
                </span>
                <h2 className="mt-3 text-[48px] font-extrabold leading-[1.05] tracking-tight text-foreground">
                  {t("home.heroBrandTitle")}
                </h2>
                <p className="mt-4 max-w-prose text-[14px] leading-relaxed text-muted">
                  {t("home.trustEscrowBody")}
                </p>
                <div className="mt-7 flex items-center gap-3">
                  <Link
                    href={"/annonces" as never}
                    className="batta-btn-luxe h-11 rounded-full px-6 text-[13px]"
                  >
                    {t("home.heroBrowseCta")}
                    <ArrowUpRight className="size-4" strokeWidth={2.5} />
                  </Link>
                  <Link
                    href={"/annonces/nouvelle" as never}
                    className="batta-btn-quiet h-11 rounded-full px-6 text-[13px]"
                  >
                    Vendre
                  </Link>
                </div>
              </div>

              {/* Right column — three quiet shortcut tiles. Each lands on
                  a different surface so the user gets a guided next step
                  no matter which intent they came in with. */}
              <div className="col-span-5 flex flex-col gap-3">
                {[
                  // Two steps, not three: "vérifiez votre identité" is gone with
                  // KYC. The full home rebuild lands in Phase 4 of the pivot.
                  { num: "01", href: "/properties" as const, title: t("nav.properties"), body: t("home.step1Body") },
                  { num: "02", href: "/annonces/nouvelle" as const, title: "Vendre",   body: t("home.step3Body") },
                ].map((s) => (
                  <Link
                    key={s.num}
                    href={s.href as never}
                    className="group flex items-start gap-4 rounded-2xl bg-surface/40 p-4 ring-1 ring-gold/15 backdrop-blur-sm transition hover:bg-surface/70 hover:ring-gold-soft/40"
                  >
                    <span className="batta-tabular text-[20px] font-extrabold leading-none text-gold">
                      {s.num}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold leading-tight text-foreground">
                        {s.title}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
                        {s.body}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:text-gold-bright" strokeWidth={2.2} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Slim footer — single inline row of legal links. The big
          brand-name + slogan + gavel rule stack was nice but the user
          flagged it as text-heavy on a marketplace home. */}
      <section className="mt-10 px-4 pb-6">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
          <Link href={"/how-it-works" as never} className="hover:text-gold-bright">
            Comment ça marche
          </Link>
          <span className="text-subtle">·</span>
          <Link href={"/help" as never} className="hover:text-gold-bright">
            Aide
          </Link>
          <span className="text-subtle">·</span>
          <Link href={"/about" as never} className="hover:text-gold-bright">
            À propos
          </Link>
          <span className="text-subtle">·</span>
          <Link href="/terms" className="hover:text-gold-bright">
            {t("landing.footerLinks.terms")}
          </Link>
          <span className="text-subtle">·</span>
          <Link href="/privacy" className="hover:text-gold-bright">
            {t("landing.footerLinks.privacy")}
          </Link>
          <span className="text-subtle">·</span>
          <Link href="/contact" className="hover:text-gold-bright">
            {t("landing.footerLinks.contact")}
          </Link>
          <span className="text-subtle">·</span>
          <span className="text-subtle">© {new Date().getFullYear()} {t("brand.name")}</span>
        </div>
      </section>
    </div>

    <HomeDesktop makeCounts={makeCounts} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Building blocks — ported from the mazed-auto home pattern
// ──────────────────────────────────────────────────────────────────────

// HOW_IT_WORKS + TRUST_PILLARS used to live here at the bottom of
// the file. They were hoisted above LandingPage (alongside StatTile's
// past placement) to dodge the Turbopack-RSC hoister bug — module
// `const` declarations defined AFTER the long LandingPage body
// occasionally fail to resolve at server-render time in dev.

// ──────────────────────────────────────────────────────────────────────
// "Recently hammered" — compact card for the closed-auction strip.
// (HammeredRow type is hoisted to the top of the file.)
// ──────────────────────────────────────────────────────────────────────

// Suspense fallback for the LiveTicker — a single thin tape row, matching
// the ticker's own height so the swap doesn't shift layout.
// StatTile lives near the top of the file as a const expression so
// Turbopack-RSC's bundle hoister can see it before LandingPage. Same
// quirk that bit the HammeredRow type alias (see the comment at the
// top of the file).
