import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Flame, Gauge, Gavel, Sparkles, Users } from "lucide-react";
import { Countdown } from "@/components/auction/Countdown";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";
import type { HotAuction } from "@/lib/db";

interface Props {
  hot: HotAuction[];
  ending: Auction[];
  newest: Auction[];
  livePoolSize: number;
}

/**
 * Desktop-only cinematic hero. Replaces the mobile PromoBanner on lg+.
 *
 * Layout (only renders at lg+; nothing changes for mobile):
 *  - Full-bleed atmospheric backdrop using the featured car blurred behind a
 *    dark vignette so the page reads like a magazine spread, not a list.
 *  - Top strip: live indicator on the start, "Browse all" pill on the end.
 *  - Big editorial headline.
 *  - Magazine spread: 1 large featured card (16/10) + 3 stacked runners.
 *  - Each card carries its own countdown pill so urgency reads at a glance.
 */
export function DesktopHero({ hot, ending, newest, livePoolSize }: Props) {
  // Featured = the hottest auction. Runners = next 3 distinct cars, falling
  // back to ending-soon then newest so the spread is always full even when
  // the hot list is short.
  const featured = hot[0];
  if (!featured) return null;

  const pool = [...hot.slice(1), ...ending, ...newest];
  const seen = new Set<string>([featured.id]);
  const runners: Auction[] = [];
  for (const a of pool) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    runners.push(a);
    if (runners.length === 3) break;
  }
  if (runners.length < 3) return null;

  return (
    <section className="hidden lg:block relative isolate overflow-hidden">
      {/* Atmospheric backdrop — featured car, blurred + heavy gradient.
          Anchors the entire hero in the actual hero photo so it doesn't feel
          generic. Sits behind everything via -z-10 + isolate on parent.
          Source is 96px wide on purpose: blur-3xl + 40% opacity erases all
          fine detail, so any larger source is paying the bandwidth bill
          for pixels nobody will ever see. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(featured.vehicle.imageUrls[0], { width: 96, quality: 30 })}
          alt=""
          className="h-full w-full object-cover scale-110 blur-3xl opacity-40"
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

      <div className="relative max-w-[var(--max-w-wide)] mx-auto px-8 pt-10 pb-14">
        {/* Top live strip */}
        <div className="flex items-center justify-between gap-4 mb-9">
          <div className="inline-flex items-center gap-2.5 px-3.5 h-9 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              En direct · {livePoolSize} enchères en cours
            </span>
          </div>

          <Link
            href="/auctions"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white/5 ring-1 ring-white/10 hover:ring-[var(--gold)] text-white font-bold text-sm backdrop-blur-md transition-all"
          >
            Parcourir le catalogue
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Editorial headline */}
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-bold text-[var(--gold)]">
              <Sparkles className="h-3.5 w-3.5" />
              Mazed Auto · Sélection éditoriale
            </div>
            <h1 className="mt-3 text-[44px] xl:text-[56px] font-black tracking-tight leading-[1.02] max-w-[20ch]">
              Les voitures qui font{" "}
              <span className="gradient-gold-text">monter les enchères</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] xl:text-base text-white/70 leading-relaxed">
              Une sélection vérifiée à la main, en temps réel — KYC humain,
              carte grise contrôlée, dépôt sécurisé. Misez sereinement.
            </p>
          </div>
        </div>

        {/* Magazine spread — featured (1.6fr) + 3 runners stacked (1fr) */}
        <div className="grid grid-cols-[1.7fr_1fr] gap-6 xl:gap-7">
          <FeaturedCard auction={featured} />

          <div className="grid grid-rows-3 gap-5 xl:gap-6">
            {runners.map((a) => (
              <RunnerCard key={a.id} auction={a} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ auction }: { auction: HotAuction }) {
  const { vehicle, currentPrice, totalBids, totalParticipants, endTime } =
    auction;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group relative block aspect-[16/10] rounded-[28px] overflow-hidden ring-1 ring-white/10 hover:ring-[var(--gold)] transition-all shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb(vehicle.imageUrls[0], { width: 1440, quality: 75 })}
        srcSet={`${thumb(vehicle.imageUrls[0], { width: 1024, quality: 72 })} 1024w, ${thumb(vehicle.imageUrls[0], { width: 1440, quality: 75 })} 1440w, ${thumb(vehicle.imageUrls[0], { width: 1600, quality: 75 })} 1600w`}
        sizes="(max-width: 1280px) 80vw, 1024px"
        alt={`${vehicle.make} ${vehicle.model}`}
        /* Desktop hero — must paint first. Eager + high priority,
           explicit dims for the browser to reserve layout before
           bytes arrive (no CLS). */
        loading="eager"
        // @ts-expect-error — fetchpriority not in React's HTML types yet
        fetchpriority="high"
        decoding="async"
        width={1440}
        height={900}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
        draggable={false}
      />
      {/* Layered gradient — strong at the bottom for legibility, soft from
          the top so the eyebrow + countdown pills stay readable. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />

      {/* Top corners — eyebrow + countdown */}
      <div className="absolute inset-x-0 top-0 p-6 flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-[var(--gold)] text-black text-[11px] font-extrabold uppercase tracking-wider shadow-[var(--shadow-gold)]">
          <Flame className="h-3.5 w-3.5" />
          La plus disputée
        </span>
        <span className="inline-flex items-center gap-2 px-3.5 h-9 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15 text-white">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-[var(--gold)] animate-ping opacity-60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
          </span>
          <Countdown
            endTime={endTime}
            size="md"
            withIcon={false}
            className="text-[13px] font-bold tabular-nums text-white"
          />
        </span>
      </div>

      {/* Bottom — title + price + CTA */}
      <div className="absolute inset-x-0 bottom-0 p-7 xl:p-8 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)] mb-2">
            À la une
          </div>
          <h2 className="text-[34px] xl:text-[42px] font-black text-white leading-[1.02] tracking-tight">
            {vehicle.make} {vehicle.model}
          </h2>
          <div className="mt-2 text-base xl:text-lg text-white/75 font-light flex items-center gap-3">
            <span>{vehicle.year}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>{vehicle.color}</span>
            {vehicle.mileage > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" />
                  {Intl.NumberFormat("fr-TN").format(vehicle.mileage)} km
                </span>
              </>
            )}
          </div>

          <div className="mt-5 flex items-end gap-7">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/60">
                Prix actuel
              </div>
              <div className="mt-1 text-4xl xl:text-[44px] font-black gradient-gold-text tabular-nums leading-none">
                {formatPrice(currentPrice)}
              </div>
            </div>
            <div className="hidden xl:flex items-center gap-5 pb-1.5 text-white/85 text-sm">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Gavel className="h-4 w-4 text-[var(--gold)]" />
                {totalBids} enchères
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Users className="h-4 w-4 text-[var(--gold)]" />
                {totalParticipants} participants
              </span>
            </div>
          </div>
        </div>

        <span className="shrink-0 inline-flex items-center gap-2 px-6 h-12 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] group-hover:scale-[1.04] active:scale-[0.99] transition-transform">
          Voir l&apos;enchère
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function RunnerCard({ auction }: { auction: Auction }) {
  const { vehicle, currentPrice, endTime } = auction;
  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group relative block rounded-2xl overflow-hidden ring-1 ring-white/10 hover:ring-[var(--gold)] transition-all"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb(vehicle.imageUrls[0], { width: 720, quality: 70 })}
        alt={`${vehicle.make} ${vehicle.model}`}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

      {/* Countdown pill — top end */}
      <span className="absolute top-3 end-3 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-black/65 backdrop-blur-md ring-1 ring-white/10 text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
        <Countdown
          endTime={endTime}
          size="sm"
          withIcon={false}
          className="text-[11px] font-bold tabular-nums text-white"
        />
      </span>

      <div className="relative h-full min-h-[140px] flex items-end p-4">
        <div className="space-y-1 min-w-0">
          <div className="text-[15px] font-extrabold text-white leading-tight line-clamp-1">
            {vehicle.make} {vehicle.model}{" "}
            <span className="font-light text-white/70">{vehicle.year}</span>
          </div>
          <div className="text-[var(--gold)] font-bold tabular-nums text-[15px]">
            {formatPrice(currentPrice)}
          </div>
        </div>
      </div>
    </Link>
  );
}
