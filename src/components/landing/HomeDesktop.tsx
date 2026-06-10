import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LiveTicker } from "@/components/landing/LiveTicker";
import { TrendingRail } from "@/components/landing/TrendingRail";
import { EndingSoonBanner } from "@/components/landing/EndingSoonBanner";
import { HeroBanner, type HeroSlide } from "@/components/landing/HeroBanner";
import { DesktopHero } from "@/components/landing/DesktopHero";
import { PropertyCard } from "@/components/property/PropertyCard";
import type { AuctionWithProperty } from "@/lib/types";
import {
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  ClipboardCheck,
  Scale,
  Lock,
  Car,
  Truck,
} from "lucide-react";

/**
 * Desktop (lg+) home surface. The signature piece is the cinematic
 * MAGAZINE HERO at the top — 1 large featured lot + 3 stacked runner
 * cards over a blurred-photo backdrop — ported from the original
 * mazed-auto home (see DesktopHero.tsx). Below it, every listing
 * surface is an AUTO-SLIDING carousel (TrendingRail), then editorial
 * bands (browse, trust, footer) close the page.
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

// Labels come from i18n (`property.types.<key>`); the tile art is a
// pre-optimized illustration at /icons/<key>.{avif,webp}.
const PROPERTY_TYPES: { key: string }[] = [
  { key: "sedan" },
  { key: "suv" },
  { key: "hatchback" },
  { key: "pickup" },
  { key: "coupe" },
  { key: "van" },
];

const PRICE_BUCKETS: { key: string; label: string; query: string }[] = [
  { key: "under-30k", label: "Moins de 30k", query: "max_price=30000" },
  { key: "30k-60k",   label: "30k – 60k",    query: "min_price=30000&max_price=60000" },
  { key: "60k-120k",  label: "60k – 120k",   query: "min_price=60000&max_price=120000" },
  { key: "120k-plus", label: "120k+ TND",    query: "min_price=120000" },
];

const TRUST_PILLARS: {
  key: string;
  titleKey: string;
  bodyKey: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { key: "escrow",     titleKey: "home.trustEscrowTitle",     bodyKey: "home.trustEscrowBody",     Icon: Lock },
  { key: "kyc",        titleKey: "home.trustKycTitle",        bodyKey: "home.trustKycBody",        Icon: ShieldCheck },
  { key: "inspection", titleKey: "home.trustInspectionTitle", bodyKey: "home.trustInspectionBody", Icon: ClipboardCheck },
  { key: "legal",      titleKey: "home.trustLegalTitle",      bodyKey: "home.trustLegalBody",      Icon: Scale },
];

export async function HomeDesktop({
  trending,
  offers,
  nouveautes,
  recent,
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

  // The magazine hero draws its featured lot + runners from the richest
  // pool we have (trending leads — it's already paid-placement + ends_at
  // sorted), falling back through the other surfaces so the spread is
  // always full even on a thin catalogue.
  const heroPool: AuctionWithProperty[] = [
    ...trending,
    ...offers,
    ...nouveautes,
    ...recent,
  ];

  return (
    <div className={alwaysVisible ? "block" : "hidden lg:block"}>
      {/* ─── CINEMATIC MAGAZINE HERO — full-bleed, 1 featured + 3 runners ─── */}
      <DesktopHero pool={heroPool} liveCount={liveCount} />

      {/* Everything below the hero stays in the constrained content column. */}
      <div className="mx-auto max-w-[var(--max-w-wide)] px-8 pb-24">
        {/* LIVE TICKER — streamed so it never blocks the desktop shell. */}
        <section className="mt-10">
          <Suspense fallback={<div className="h-9 rounded-full bg-surface-2" />}>
            <LiveTicker />
          </Suspense>
        </section>

        {/* TRENDING — auto-sliding carousel */}
        {trending.length > 0 && (
          <section className="mt-12">
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

        {/* ─── POURQUOI MAZED — one consolidated trust + CTA band ─── */}
        <section className="mt-16">
          <div className="overflow-hidden rounded-3xl ring-1 ring-gold/25">
            <div className="grid grid-cols-12">
              {/* Value prop + CTA */}
              <div className="batta-surface-navy-luxe relative col-span-5 flex flex-col justify-center p-10">
                <span className="batta-eyebrow">{t("home.trustEyebrow")}</span>
                <h2 className="mt-3 text-[28px] font-extrabold leading-[1.12] tracking-tight">
                  {t("home.trustTitle")}
                </h2>
                <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-muted">
                  {t("home.trustEscrowBody")}
                </p>
                <div className="mt-7 flex items-center gap-3">
                  <Link
                    href="/properties"
                    className="batta-gold-fill inline-flex items-center gap-2 rounded-full px-5 py-3 text-[12.5px] font-extrabold uppercase tracking-[0.14em] shadow-[var(--shadow-gold)] transition active:scale-[0.99]"
                  >
                    {t("home.heroBrowseCta")}
                    <ArrowUpRight className="size-4" strokeWidth={2.5} />
                  </Link>
                  <Link
                    href="/sell"
                    className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-5 py-3 text-[12.5px] font-bold text-foreground transition hover:border-gold-soft/60 hover:bg-gold-faint"
                  >
                    Vendre
                  </Link>
                </div>
              </div>

              {/* Four trust pillars — 2×2, hairline-divided. */}
              <div className="col-span-7 grid grid-cols-2 gap-px bg-border">
                {TRUST_PILLARS.map((p) => (
                  <div key={p.key} className="flex flex-col gap-2.5 bg-surface p-7">
                    <span className="batta-monogram batta-monogram-filled size-11 text-gold">
                      <p.Icon className="size-4" strokeWidth={2.2} />
                    </span>
                    <div className="text-[14.5px] font-bold leading-tight text-foreground">
                      {t(p.titleKey)}
                    </div>
                    <p className="text-[12px] leading-relaxed text-muted">
                      {t(p.bodyKey)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
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
}: {
  items: AuctionWithProperty[];
  savedIds: Set<string>;
  loggedIn: boolean;
  priorityCount?: number;
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
          />
        </div>
      ))}
      <div className="w-1 shrink-0" />
    </TrendingRail>
  );
}

/** Inline car-category glyph for the "Parcourir" tiles. The old desktop
 *  tiles pointed at /icons/<key>.{avif,webp}, but those were real-estate
 *  art (apartment/house/land/…) and the car keys (sedan/suv/…) have no
 *  raster, so the tiles 404'd. Mobile already uses lucide glyphs; we do
 *  the same here so the row is consistent + asset-free. */
function CarTypeIcon({ typeKey }: { typeKey: string }) {
  // Pickup + van read better as a truck silhouette; everything else is a
  // car. (lucide's set has no per-body-style car glyphs.)
  const truckish = typeKey === "pickup" || typeKey === "van";
  return truckish ? (
    <Truck className="size-6" strokeWidth={1.8} />
  ) : (
    <Car className="size-6" strokeWidth={1.8} />
  );
}
