import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowUpRight,
  Flame,
  Gauge,
  Gavel,
  MapPin,
  Sparkles,
} from "lucide-react";
import { LiveTimer } from "@/components/landing/LiveTimer";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { formatTND } from "@/lib/utils";
import type { AuctionWithProperty } from "@/lib/types";

/**
 * Desktop-only cinematic hero — the "magazine spread" ported from the
 * original mazed-auto home (`web/src/components/home/DesktopHero.tsx`).
 * Renders only at lg+ (the route's mobile tree owns phones via its own
 * HeroBanner). Adapted to v2's data shape: instead of the mock
 * `Vehicle`/`Auction` objects, it consumes `AuctionWithProperty` rows
 * (photos in `property.photos[].storage_path`, price in
 * `current_price`/`opening_price`, specs in `property.attributes`).
 *
 * Layout:
 *  - Full-bleed atmospheric backdrop: the featured car blurred behind a
 *    dark vignette so the page reads like a magazine spread.
 *  - Top strip: live indicator (start) + "Parcourir le catalogue" (end).
 *  - Editorial eyebrow + big headline (last words in gold).
 *  - Magazine spread: 1 large featured card (16/10) + 3 stacked runners,
 *    each with its own live countdown pill.
 */

/** Per-car display fields, read from `property.attributes` with a
 *  fallback to the title (which is already "Make Model Year"). */
function spec(a: AuctionWithProperty) {
  const at = (a.property.attributes ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const make = str(at.make);
  const model = str(at.model);
  const year = str(at.year);
  const color = str(at.color);
  const mileageNum = Number(at.mileage);
  const mileage = Number.isFinite(mileageNum) ? mileageNum : 0;
  // Headline = "Make Model" when we have specs; otherwise the full title.
  const headline = make || model ? `${make} ${model}`.trim() : a.property.title;
  return { make, model, year, color, mileage, headline };
}

/** First photo (by sort_order) resolved to a public URL, or null. */
function coverUrl(a: AuctionWithProperty): string | null {
  const photo = a.property.photos
    ?.slice()
    .sort((p, q) => p.sort_order - q.sort_order)[0];
  return photo ? propertyPhotoUrl(photo.storage_path) : null;
}

export async function DesktopHero({
  pool,
  liveCount,
}: {
  /** Auctions to draw the featured lot + runners from (trending first). */
  pool: AuctionWithProperty[];
  liveCount: number;
}) {
  const locale = await getLocale();

  // Featured = first lot with a photo. Runners = next 3 distinct lots
  // that also have a photo, so the spread is never half-empty.
  const withPhoto = pool.filter((a) => coverUrl(a) !== null);
  const featured = withPhoto[0];
  // Low inventory / data timeout: no photographed lot to feature → render the
  // brand fallback hero so the desktop page is never headless (audit #18).
  if (!featured) return <FallbackHero liveCount={liveCount} />;

  const seen = new Set<string>([featured.id]);
  const runners: AuctionWithProperty[] = [];
  for (const a of withPhoto.slice(1)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    runners.push(a);
    if (runners.length === 3) break;
  }
  // Fewer than 3 runners is fine — we render however many we have (the featured
  // card alone if none) instead of vanishing the whole hero on thin inventory.

  const backdrop = coverUrl(featured)!;

  return (
    <section className="hidden lg:block relative isolate overflow-hidden">
      {/* Atmospheric backdrop — featured car, blurred + heavy gradient so
          the hero is anchored in the actual lot photo, not a flat panel. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backdrop}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-40 blur-3xl"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/85 to-background" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, rgba(212,175,55,0.22), transparent 40%), radial-gradient(circle at 80% 80%, rgba(212,175,55,0.18), transparent 45%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[var(--max-w-wide)] px-8 pb-14 pt-10">
        {/* Top live strip */}
        <div className="mb-9 flex items-center justify-between gap-4">
          <div className="inline-flex h-9 items-center gap-2.5 rounded-full bg-emerald-500/10 px-3.5 ring-1 ring-emerald-500/30 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              {liveCount} enchères en cours
            </span>
          </div>

          <Link
            href="/properties"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-sm font-bold text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:ring-[var(--gold)]"
          >
            Parcourir le catalogue
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Editorial headline */}
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--gold)]">
              <Sparkles className="h-3.5 w-3.5" />
              Mazed Auto · Sélection éditoriale
            </div>
            <h1 className="mt-3 max-w-[20ch] text-[44px] font-black leading-[1.02] tracking-tight xl:text-[56px]">
              Les voitures qui font{" "}
              <span className="gradient-gold-text">monter les enchères</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70 xl:text-base">
              Une sélection vérifiée à la main, en temps réel — KYC humain,
              carte grise contrôlée, dépôt sécurisé. Misez sereinement.
            </p>
          </div>
        </div>

        {/* Magazine spread — featured + the runners we have (0–3). With no
            runners the featured card spans full width instead of leaving a gap. */}
        <div className={runners.length > 0 ? "grid grid-cols-[1.7fr_1fr] gap-6 xl:gap-7" : ""}>
          <FeaturedCard auction={featured} locale={locale} />

          {runners.length > 0 && (
            <div
              className="grid gap-5 xl:gap-6"
              style={{ gridTemplateRows: `repeat(${runners.length}, minmax(0, 1fr))` }}
            >
              {runners.map((a) => (
                <RunnerCard key={a.id} auction={a} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({
  auction,
  locale,
}: {
  auction: AuctionWithProperty;
  locale: string;
}) {
  const { headline, year, color, mileage } = spec(auction);
  const img = coverUrl(auction)!;
  const price = auction.current_price ?? auction.opening_price;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group relative block aspect-[16/10] overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/10 transition-all hover:ring-[var(--gold)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={headline}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
        draggable={false}
      />
      {/* Layered gradient — strong at the bottom for legibility. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />

      {/* Top corners — eyebrow badge + live countdown */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-6">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--gold)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-black shadow-[var(--shadow-gold)]">
          <Flame className="h-3.5 w-3.5" />
          La plus disputée
        </span>
        <span className="inline-flex h-9 items-center gap-2 rounded-full bg-black/60 px-3.5 text-white ring-1 ring-white/15 backdrop-blur-md">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--gold)] opacity-60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
          </span>
          <LiveTimer
            endsAt={auction.ends_at}
            className="text-[13px] font-bold text-white"
          />
        </span>
      </div>

      {/* Bottom — title + price + CTA */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-7 xl:p-8">
        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--gold)]">
            À la une
          </div>
          <h2 className="text-[34px] font-black leading-[1.02] tracking-tight text-white xl:text-[42px]">
            {headline}
          </h2>
          <div className="mt-2 flex items-center gap-3 text-base font-light text-white/75 xl:text-lg">
            {year && <span>{year}</span>}
            {color && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span>{color}</span>
              </>
            )}
            {mileage > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" />
                  {Intl.NumberFormat("fr-FR").format(mileage)} km
                </span>
              </>
            )}
          </div>

          <div className="mt-5 flex items-end gap-7">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                Prix actuel
              </div>
              <div className="gradient-gold-text mt-1 text-4xl font-black leading-none tabular-nums xl:text-[44px]">
                {formatTND(price, locale)}
                <span className="ms-2 align-middle text-[0.5em] font-extrabold uppercase tracking-[0.1em]">
                  TND
                </span>
              </div>
            </div>
            <div className="hidden items-center gap-5 pb-1.5 text-sm text-white/85 xl:flex">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Gavel className="h-4 w-4 text-[var(--gold)]" />
                {auction.bid_count} enchères
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[var(--gold)]" />
                {auction.property.governorate}
              </span>
            </div>
          </div>
        </div>

        <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--gold)] px-6 text-sm font-extrabold text-black shadow-[var(--shadow-gold)] transition-transform group-hover:scale-[1.04] active:scale-[0.99]">
          Voir l&apos;enchère
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function RunnerCard({
  auction,
  locale,
}: {
  auction: AuctionWithProperty;
  locale: string;
}) {
  const { headline, year } = spec(auction);
  const img = coverUrl(auction)!;
  const price = auction.current_price ?? auction.opening_price;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group relative block overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all hover:ring-[var(--gold)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={headline}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

      {/* Countdown pill — top end */}
      <span className="absolute end-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-black/65 px-2.5 text-white ring-1 ring-white/10 backdrop-blur-md">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
        <LiveTimer
          endsAt={auction.ends_at}
          className="text-[11px] font-bold text-white"
        />
      </span>

      <div className="relative flex h-full min-h-[140px] items-end p-4">
        <div className="min-w-0 space-y-1">
          <div className="line-clamp-1 text-[15px] font-extrabold leading-tight text-white">
            {headline}{" "}
            {year && <span className="font-light text-white/70">{year}</span>}
          </div>
          <div className="text-[15px] font-bold tabular-nums text-[var(--gold)]">
            {formatTND(price, locale)}
            <span className="ms-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--gold)]/70">
              TND
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Brand fallback hero — shown when there isn't a photographed lot to feature
 * (fresh launch, thin inventory, or the data-phase timeout). Keeps the desktop
 * page anchored with a headline + catalogue CTA instead of starting headless.
 */
function FallbackHero({ liveCount }: { liveCount: number }) {
  return (
    <section className="hidden lg:block relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c0c] via-[#0a0a0a] to-background" />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, rgba(212,175,55,0.22), transparent 40%), radial-gradient(circle at 80% 80%, rgba(212,175,55,0.18), transparent 45%)",
          }}
        />
      </div>
      <div className="relative mx-auto max-w-[var(--max-w-wide)] px-8 pb-16 pt-14">
        <div className="inline-flex h-9 items-center gap-2.5 rounded-full bg-emerald-500/10 px-3.5 ring-1 ring-emerald-500/30 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            {liveCount} enchères en cours
          </span>
        </div>
        <div className="mt-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--gold)]">
          <Sparkles className="h-3.5 w-3.5" />
          Mazed Auto · Sélection éditoriale
        </div>
        <h1 className="mt-3 max-w-[20ch] text-[44px] font-black leading-[1.02] tracking-tight xl:text-[56px]">
          Les voitures qui font{" "}
          <span className="gradient-gold-text">monter les enchères</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70 xl:text-base">
          Une sélection vérifiée à la main — KYC humain, carte grise contrôlée,
          dépôt sécurisé. Misez sereinement.
        </p>
        <Link
          href="/properties"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--gold)] px-6 text-sm font-extrabold text-black shadow-[var(--shadow-gold)] transition-transform hover:scale-[1.03]"
        >
          Parcourir le catalogue
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
