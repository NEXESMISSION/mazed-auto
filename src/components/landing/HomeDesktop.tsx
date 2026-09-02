import Image from "next/image";
import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LiveTicker } from "@/components/landing/LiveTicker";
import { TrendingRail } from "@/components/landing/TrendingRail";
import { EndingSoonBanner } from "@/components/landing/EndingSoonBanner";
import { HeroBanner, type HeroSlide } from "@/components/landing/HeroBanner";
import { DesktopHero } from "@/components/landing/DesktopHero";
import { BrandRail } from "@/components/landing/BrandRail";
import { AnnonceRail } from "@/components/landing/AnnonceRail";
import { AUCTIONS_VISIBLE } from "@/lib/features";
import { AnnonceHero } from "./AnnonceHero";
import { PropertyCard } from "@/components/property/PropertyCard";
import { propertyPhotoUrl, isStaticSeedPath } from "@/lib/imageUrl";
import { formatTND, cn } from "@/lib/utils";
import type { AuctionWithProperty } from "@/lib/types";
import {
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Car,
  Truck,
  Gavel,
  Trophy,
  MapPin,
  Tag,
  Crown,
} from "lucide-react";

/**
 * Desktop (lg+) home surface. The signature piece is the cinematic
 * MAGAZINE HERO at the top — 1 large featured lot + 3 stacked runner
 * cards over a blurred-photo backdrop — ported from the original
 * mazed-auto home (see DesktopHero.tsx). Below it the feed is grouped
 * by editorial SECTION DIVIDERS ("Enchères en direct" vs "Récemment
 * vendues") just like v1, each listing surface is an AUTO-SLIDING
 * carousel, and the page closes on the twin-pillar buyers/sellers CTA.
 *
 * Kept in its own file so the mobile tree in the route's page.tsx is
 * never touched; rendered behind `hidden lg:block`, so it costs nothing
 * on phones.
 */

type HammeredRow = {
  id: string;
  winner_amount: number | string | null;
  hammer_at: string | null;
  type: string;
  property: {
    title: string;
    governorate: string;
    photos?: { id: string; storage_path: string; sort_order: number }[];
  };
};

const PROPERTY_TYPES: { key: string }[] = [
  { key: "sedan" },
  { key: "suv" },
  { key: "hatchback" },
  { key: "pickup" },
  { key: "coupe" },
  { key: "van" },
  { key: "spare_part" },
];

const PRICE_BUCKETS: { key: string; label: string; query: string }[] = [
  { key: "under-30k", label: "Moins de 30k", query: "max_price=30000" },
  { key: "30k-60k",   label: "30k – 60k",    query: "min_price=30000&max_price=60000" },
  { key: "60k-120k",  label: "60k – 120k",   query: "min_price=60000&max_price=120000" },
  { key: "120k-plus", label: "120k+ TND",    query: "min_price=120000" },
];

export async function HomeDesktop({
  trending,
  offers,
  nouveautes,
  recent,
  hammered,
  savedIds,
  loggedIn,
  liveCount,
  endingSoonSlides = [],
  alwaysVisible = false,
}: {
  trending: AuctionWithProperty[];
  offers: AuctionWithProperty[];
  nouveautes: AuctionWithProperty[];
  recent: AuctionWithProperty[];
  hammered: HammeredRow[];
  savedIds: Set<string>;
  loggedIn: boolean;
  liveCount: number;
  scheduledCount: number;
  soldThisMonthCount: number;
  coverageGovs: number;
  /** "Ending soon" hero carousel slides — the second hero that used to be
   *  mobile-only. Empty array hides it. */
  endingSoonSlides?: HeroSlide[];
  /** When true the root drops its `hidden lg:block` gate and renders at
   *  all widths — set by the home page when it has already decided (via
   *  UA) to send only the desktop tree. */
  alwaysVisible?: boolean;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const isRTL = locale === "ar";
  const ChevronEnd = isRTL ? ChevronLeft : ChevronRight;

  // "Les plus disputées" — live lots ranked by bid count (distinct from
  // `trending`, which sorts by ends_at + paid placement).
  const hotNow = [...trending]
    .filter((a) => (a.bid_count ?? 0) > 0)
    .sort((x, y) => (y.bid_count ?? 0) - (x.bid_count ?? 0))
    .slice(0, 8);

  // "Dernière chance" — lots whose hammer falls within the hour. This is
  // an async server component revalidated every 60s, so reading the clock
  // at render keeps the window honest enough; the cards' own countdowns
  // stay live client-side.
  const nowMs = Date.now();
  const lastCall = trending
    .filter((a) => {
      if (a.status !== "live" && a.status !== "extending") return false;
      const remainingMs = new Date(a.ends_at).getTime() - nowMs;
      return remainingMs > 0 && remainingMs < 60 * 60 * 1000;
    })
    .sort(
      (x, y) => new Date(x.ends_at).getTime() - new Date(y.ends_at).getTime(),
    )
    .slice(0, 8);

  // "En vedette" — paid/featured placements (v1's VipRail). Drawn across
  // all loaded surfaces so a featured direct listing shows too.
  const vipSeen = new Set<string>();
  const vip = [...trending, ...offers, ...nouveautes]
    .filter((a) => {
      if (vipSeen.has(a.id) || !a.property?.promo_home_featured) return false;
      vipSeen.add(a.id);
      return true;
    })
    .slice(0, 4);

  // The magazine hero draws its featured lot + runners from the richest
  // pool we have. Lead with the hottest lots so the "La plus disputée"
  // badge is accurate (like v1's hot[0]); fall back through trending and
  // the other surfaces so the spread is always full on a thin catalogue.
  // DesktopHero dedupes by id, so the overlap with `trending` is harmless.
  const heroPool: AuctionWithProperty[] = [
    ...hotNow,
    ...trending,
    ...offers,
    ...nouveautes,
    ...recent,
  ];

  // "Parcourir par marque" — distinct makes across the loaded surfaces,
  // ranked by lot count. Titles are "Make Model Year", so the leading
  // token is the make — no extra query or brand-logo assets needed.
  const seenIds = new Set<string>();
  const makeCount = new Map<string, number>();
  for (const a of [...trending, ...nouveautes, ...offers, ...recent]) {
    if (seenIds.has(a.id)) continue;
    seenIds.add(a.id);
    const mk = String(a.property?.title ?? "").trim().split(/\s+/)[0];
    if (mk) makeCount.set(mk, (makeCount.get(mk) ?? 0) + 1);
  }
  const topMakes = [...makeCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return (
    <div className={alwaysVisible ? "block" : "hidden lg:block"}>
      {/* ─── CINEMATIC MAGAZINE HERO — full-bleed, 1 featured + 3 runners ───
          The v3 cover: same spread, drawn from the annonces catalog. It
          replaces DesktopHero, which spoke in countdowns and bid counts and
          went dark with the auction blocks — taking the whole top of the page
          with it. AnnonceHero renders BOTH trees (it owns the mobile carousel
          too), so this instance is desktop-only via its own breakpoints. */}
      <AnnonceHero />

      {/* ── v2 AUCTION BLOCKS (desktop) ──
          Hidden with AUCTIONS_VISIBLE, same as the mobile tree: the hero,
          the ticker, every bid rail, "Les voitures à miser" and the sold-lot
          proof strip. What survives below is what still describes the
          product — the brand rail, the trust strip and the footer.
          Phase 6 deletes this file along with the rest of the auction UI. */}
      {AUCTIONS_VISIBLE && <DesktopHero pool={heroPool} liveCount={liveCount} />}

        {/* Everything below the hero stays in the constrained content column. */}
        <div className="mx-auto max-w-[var(--max-w-wide)] px-8 pb-24">
        {/* The v3 catalog on desktop. The home page's own rails live inside its
            lg:hidden tree, so they never reach this breakpoint. */}
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

        {AUCTIONS_VISIBLE && (
          <>
          {/* LIVE TICKER — streamed so it never blocks the desktop shell. */}
          <section className="mt-10">
            <Suspense fallback={<div className="h-9 rounded-full bg-surface-2" />}>
              <LiveTicker />
            </Suspense>
          </section>

          {/* ════════════════════════════════════════════════════════════
              SECTION · ENCHÈRES EN DIRECT — everything biddable now.
              ════════════════════════════════════════════════════════════ */}
          <SectionDivider
            tone="live"
            eyebrow="Enchères en cours"
            title="Les voitures à miser"
            subtitle="Les plus suivies, les plus disputées et les nouveautés — toutes vérifiées, toutes biddables maintenant."
          />

          {/* TRENDING — auto-sliding carousel */}
          {trending.length > 0 && (
            <section className="mt-10">
              <RailHeader
                eyebrow={t("home.trendingEyebrow")}
                title={t("home.trendingTitle")}
                countLabel={trending.length}
                ChevronEnd={ChevronEnd}
                isRTL={isRTL}
                seeAllLabel={t("home.seeAll")}
              />
              <CardSlider
                items={trending}
                savedIds={savedIds}
                loggedIn={loggedIn}
                priorityCount={4}
              />
            </section>
          )}

          {/* LES PLUS DISPUTÉES — hottest by bid count */}
          {hotNow.length > 0 && (
            <section className="mt-12">
              <RailHeader
                eyebrow="🔥 Chaud"
                title="Les plus disputées"
                countLabel={hotNow.length}
                ChevronEnd={ChevronEnd}
                isRTL={isRTL}
                seeAllLabel={t("home.seeAll")}
              />
              <CardSlider items={hotNow} savedIds={savedIds} loggedIn={loggedIn} hot />
            </section>
          )}

          {/* DERNIÈRE CHANCE — hammers falling within the hour (red urgency
              tier, ported from v1's LastCallRail; inline header because the
              red treatment diverges from the gold RailHeader). */}
          {lastCall.length > 0 && (
            <section className="mt-12">
              <div className="flex items-end justify-between gap-3 px-4">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-60" />
                      <span className="relative h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-red-400">
                      Dernière chance
                    </span>
                  </div>
                  <h3 className="inline-flex items-center gap-2 text-[20px] font-extrabold leading-tight tracking-tight">
                    {"Se terminent dans moins d'une heure"}
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500/15 px-2.5 text-[11px] font-extrabold tracking-wider text-red-300 ring-1 ring-red-500/40">
                      {lastCall.length}
                    </span>
                  </h3>
                </div>
                <Link
                  href="/properties"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-gold-soft/40 hover:text-gold"
                >
                  {t("home.seeAll")}
                  <ChevronEnd className="size-3" />
                </Link>
              </div>
              <CardSlider items={lastCall} savedIds={savedIds} loggedIn={loggedIn} />
            </section>
          )}

          {/* EN VEDETTE — paid/featured placements (v1's VipRail: Crown header,
              faint gold radial glow behind a 4-up grid so the premium tier
              stands apart from the scrolling rails). */}
          {vip.length > 0 && (
            <section className="mt-12">
              <div className="flex items-end justify-between gap-3 px-4">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Crown className="size-3.5 text-gold" strokeWidth={2.2} />
                    <span className="batta-eyebrow">Sélection premium</span>
                  </div>
                  <h3 className="text-[20px] font-extrabold leading-tight tracking-tight">
                    En <span className="gradient-gold-text">vedette</span>
                  </h3>
                </div>
                <Link
                  href="/properties"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-gold-soft/40 hover:text-gold"
                >
                  {t("home.seeAll")}
                  <ChevronEnd className="size-3" />
                </Link>
              </div>
              <div className="relative mt-4 px-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-4 top-1/2 h-1/2 -translate-y-1/2 rounded-[28px] opacity-[0.18]"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(212,175,55,0.25), transparent 60%)",
                  }}
                />
                <div className="relative grid grid-cols-4 gap-6">
                  {vip.map((a) => (
                    <PropertyCard
                      key={a.id}
                      auction={a}
                      saved={savedIds.has(a.id)}
                      loggedIn={loggedIn}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* OFFRES DIRECTES — auto-sliding carousel */}
          {offers.length > 0 && (
            <section className="mt-12">
              <RailHeader
                eyebrow="Achat immédiat"
                title="Offres directes"
                countLabel={offers.length}
                ChevronEnd={ChevronEnd}
                isRTL={isRTL}
                seeAllLabel={t("home.seeAll")}
              />
              <CardSlider items={offers} savedIds={savedIds} loggedIn={loggedIn} />
            </section>
          )}

          {/* NOUVEAUTÉS — auto-sliding carousel */}
          {nouveautes.length > 0 && (
            <section className="mt-12">
              <RailHeader
                eyebrow={t("home.nouveautesEyebrow")}
                title={t("home.nouveautesTitle")}
                countLabel={nouveautes.length}
                ChevronEnd={ChevronEnd}
                isRTL={isRTL}
                seeAllLabel={t("home.seeAll")}
              />
              <CardSlider items={nouveautes} savedIds={savedIds} loggedIn={loggedIn} />
            </section>
          )}

          {/* SECOND HERO — "ending soon" carousel (was mobile-only). */}
          {endingSoonSlides.length > 0 && (
            <section className="mt-12">
              <HeroBanner slides={endingSoonSlides} isRTL={isRTL} />
            </section>
          )}

          {/* ENDING SOON band */}
          <section className="mt-12">
            <Suspense fallback={null}>
              <EndingSoonBanner />
            </Suspense>
          </section>

          {/* PARCOURIR — category tiles (one row) + price pills */}
          <section className="mt-14">
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="batta-eyebrow">Parcourir</span>
                <h3 className="mt-1.5 text-[22px] font-extrabold leading-tight tracking-tight">
                  Trouvez votre voiture
                </h3>
              </div>
              <Link
                href="/properties"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-gold-soft/40 hover:text-gold"
              >
                {t("home.seeAll")}
                <ChevronEnd className="size-3" />
              </Link>
            </div>

            {/* Type — six compact category tiles across one row. */}
            <div className="mt-6 grid grid-cols-6 gap-3">
              {PROPERTY_TYPES.map((pt) => (
                <Link
                  key={pt.key}
                  href={`/properties?types=${pt.key}` as `/properties`}
                  className="group flex flex-col items-center gap-2 rounded-2xl bg-surface px-3 py-5 ring-1 ring-border transition hover:-translate-y-0.5 hover:bg-surface-2 hover:ring-gold-soft/50"
                >
                  <span className="inline-flex size-12 items-center justify-center rounded-xl bg-gold-faint text-gold ring-1 ring-gold/15 transition group-hover:ring-gold/30">
                    <CarTypeIcon typeKey={pt.key} />
                  </span>
                  <span className="text-[12.5px] font-bold text-foreground">
                    {t(`property.types.${pt.key}`)}
                  </span>
                </Link>
              ))}
            </div>

            {/* Price — four pills across one row. */}
            <div className="mt-3 grid grid-cols-4 gap-3">
              {PRICE_BUCKETS.map((b) => (
                <Link
                  key={b.key}
                  href={`/properties?${b.query}` as `/properties`}
                  className="group flex items-center justify-between rounded-2xl bg-surface px-5 py-3.5 ring-1 ring-border transition hover:bg-gold-faint hover:ring-gold-soft/50"
                >
                  <span className="text-[13px] font-bold text-foreground">{b.label}</span>
                  <ArrowUpRight
                    className="size-4 text-muted transition group-hover:text-gold-bright"
                    strokeWidth={2.2}
                  />
                </Link>
              ))}
            </div>
          </section>

          {/* MORE TO EXPLORE — auto-sliding carousel */}
          {recent.length > 0 && (
            <section className="mt-14">
              <RailHeader
                title={t("home.moreToExplore")}
                ChevronEnd={ChevronEnd}
                isRTL={isRTL}
                seeAllLabel={t("home.seeAll")}
              />
              <CardSlider items={recent} savedIds={savedIds} loggedIn={loggedIn} />
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════
              SECTION · RÉCEMMENT VENDUES — social proof / history.
              ════════════════════════════════════════════════════════════ */}
          {hammered.length > 0 && (
            <>
              <SectionDivider
                tone="sold"
                eyebrow="Récemment vendues"
                title="La preuve qu'on vend"
                subtitle="Voitures attribuées récemment — prix réels obtenus aux enchères."
              />
              <section className="mt-8">
                <div className="grid grid-cols-4 gap-5">
                  {hammered.slice(0, 8).map((h) => (
                    <HammeredCard
                      key={h.id}
                      row={h}
                      locale={locale}
                      soldLabel={t("home.soldChip")}
                      tnd={t("common.tnd")}
                    />
                  ))}
                </div>
              </section>
            </>
          )}

        </>
      )}

      {/* PARCOURIR PAR MARQUE — make chips */}
      {topMakes.length > 0 && (
        <BrandRail makes={topMakes} title="Parcourir par marque" />
      )}

        {/* ─── CLOSING CTA — twin pillars (buyers / sellers) ─── */}
        <section className="mt-16">
          <div className="grid grid-cols-2 gap-6">
            <CtaPillar
              href="/properties"
              Icon={Gavel}
              eyebrow="Acheteurs"
              title="Trouvez votre prochaine voiture"
              text="Des annonces vérifiées chaque jour, partout en Tunisie — voitures et pièces de rechange."
              cta="Parcourir tout"
              tone="gold"
            />
            <CtaPillar
              href="/sell"
              Icon={Tag}
              eyebrow="Vendeurs"
              title="Vendez votre voiture en toute confiance"
              text="Votre annonce vérifiée et publiée rapidement. Paiement sécurisé à la vente."
              cta="Commencer à vendre"
              tone="dark"
            />
          </div>
        </section>

        {/* FOOTER */}
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
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
    </div>
  );
}

/** Editorial section divider — gradient hairline → icon chip → eyebrow
 *  (live = emerald pulse / sold = muted) → big title → subtitle. Ported
 *  from v1's desktop HomeSectionDivider. */
function SectionDivider({
  tone,
  eyebrow,
  title,
  subtitle,
}: {
  tone: "live" | "sold";
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const Icon = tone === "live" ? Gavel : Trophy;
  return (
    <section className="mt-16" aria-label={title}>
      <div
        className={cn(
          "h-px w-full",
          tone === "live"
            ? "bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
            : "bg-gradient-to-r from-transparent via-border-strong to-transparent",
        )}
      />
      <div className="mt-7 flex items-center gap-4">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl",
            tone === "live"
              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
              : "bg-surface-2 text-muted ring-1 ring-border",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div
            className={cn(
              "inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em]",
              tone === "live" ? "text-emerald-300" : "text-muted",
            )}
          >
            {tone === "live" && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            )}
            {eyebrow}
          </div>
          <h2 className="mt-1 text-3xl font-black leading-tight tracking-tight xl:text-4xl">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>
        </div>
      </div>
    </section>
  );
}

/** Section header — eyebrow + title + count chip + "see all" link. */
function RailHeader({
  eyebrow,
  title,
  countLabel,
  ChevronEnd,
  isRTL,
  seeAllLabel,
}: {
  eyebrow?: string;
  title: string;
  countLabel?: number;
  ChevronEnd: React.ComponentType<{ className?: string }>;
  isRTL: boolean;
  seeAllLabel: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="batta-gold-rule-short" />
            <span className={`batta-eyebrow ${isRTL ? "font-arabic tracking-[0.18em]" : ""}`}>
              {eyebrow}
            </span>
          </div>
        )}
        <h3 className="inline-flex items-center gap-2 text-[20px] font-extrabold leading-tight tracking-tight">
          {title}
          {countLabel !== undefined && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-faint px-2.5 text-[11px] font-extrabold tracking-wider text-gold-bright">
              {countLabel}
            </span>
          )}
        </h3>
      </div>
      <Link
        href="/properties"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-gold-soft/40 hover:text-gold"
      >
        {seeAllLabel}
        <ChevronEnd className="size-3" />
      </Link>
    </div>
  );
}

/** Auto-sliding property carousel (wraps the shared TrendingRail). */
function CardSlider({
  items,
  savedIds,
  loggedIn,
  priorityCount = 0,
  hot = false,
}: {
  items: AuctionWithProperty[];
  savedIds: Set<string>;
  loggedIn: boolean;
  priorityCount?: number;
  /** Render each card with the glowing red "hot" FOMO pill (bid count). */
  hot?: boolean;
}) {
  return (
    <TrendingRail arrows>
      {items.map((a, i) => (
        <div key={a.id} className="w-[300px] shrink-0 snap-start">
          <PropertyCard
            auction={a}
            saved={savedIds.has(a.id)}
            loggedIn={loggedIn}
            priority={i < priorityCount}
            hot={hot}
          />
        </div>
      ))}
      <div className="w-1 shrink-0" />
    </TrendingRail>
  );
}

/** Compact "sold for X" card for the Récemment vendues grid. */
function HammeredCard({
  row,
  locale,
  soldLabel,
  tnd,
}: {
  row: HammeredRow;
  locale: string;
  soldLabel: string;
  tnd: string;
}) {
  const photo = row.property.photos
    ?.slice()
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  const price = Number(row.winner_amount ?? 0);
  return (
    <Link
      href={`/auctions/${row.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border transition hover:ring-gold-soft/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        {photo ? (
          (() => {
            const src = propertyPhotoUrl(photo.storage_path);
            return (
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 1024px) 280px, 50vw"
                unoptimized={isStaticSeedPath(src)}
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            );
          })()
        ) : (
          <div className="flex h-full items-center justify-center text-gold/20">
            <Car className="size-10" strokeWidth={1.5} />
          </div>
        )}
        <span className="batta-gold-fill absolute top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.14em] ltr:left-2 rtl:right-2">
          <Gavel className="size-2.5" strokeWidth={2.5} />
          {soldLabel}
        </span>
      </div>
      <div className="p-3">
        <div className="batta-tabular gradient-gold-text text-[18px] font-extrabold leading-none">
          {formatTND(price, locale)}
          <span className="ms-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            {tnd}
          </span>
        </div>
        <div className="mt-1.5 line-clamp-1 text-[12px] font-bold text-foreground">
          {row.property.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
          <MapPin className="size-2.5" strokeWidth={2} />
          <span className="truncate">{row.property.governorate}</span>
        </div>
      </div>
    </Link>
  );
}

/** Closing twin-pillar CTA card (buyers / sellers). Ported from v1's
 *  DesktopFinalCta. */
function CtaPillar({
  href,
  Icon,
  eyebrow,
  title,
  text,
  cta,
  tone,
}: {
  href: "/properties" | "/sell";
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  tone: "gold" | "dark";
}) {
  return (
    <Link
      href={href}
      className={`group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] p-9 ring-1 transition-all xl:p-10 ${
        tone === "gold"
          ? "bg-gradient-to-br from-[#1a1409] via-[#0a0a0a] to-black ring-gold/30 hover:ring-gold"
          : "bg-surface ring-border hover:ring-gold"
      }`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-50 ${
          tone === "gold" ? "bg-gold" : "bg-white/15"
        }`}
      />
      <div className="relative">
        <div
          className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] ${
            tone === "gold" ? "text-gold" : "text-muted"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h3 className="mt-3 max-w-md text-3xl font-black leading-tight tracking-tight xl:text-[34px]">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{text}</p>
      </div>
      <div className="relative mt-8">
        <span
          className={`inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-extrabold transition-transform group-hover:scale-[1.03] active:scale-[0.99] ${
            tone === "gold"
              ? "bg-gold text-black shadow-[var(--shadow-gold)]"
              : "bg-foreground text-black"
          }`}
        >
          {cta}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

/** Inline car-category glyph for the "Parcourir" tiles. */
function CarTypeIcon({ typeKey }: { typeKey: string }) {
  const truckish = typeKey === "pickup" || typeKey === "van";
  return truckish ? (
    <Truck className="size-6" strokeWidth={1.8} />
  ) : (
    <Car className="size-6" strokeWidth={1.8} />
  );
}
