import { cache } from "react";
import { coverPhoto } from "@/lib/listingCover";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { HeroMarquee, type MarqueeCard } from "./HeroMarquee";
import { ArrowUpRight, Gauge, MapPin, Sparkles, Wrench } from "lucide-react";

/**
 * The home cover — the v3 replacement for DesktopHero + PromoHero.
 *
 * Those two were built on auctions: countdowns, bid counts, links to
 * `/auctions/[id]`. When the auction blocks went behind AUCTIONS_VISIBLE the
 * hero went dark with them, and the home page lost its entire top — it opened
 * straight onto a rail of cards. This restores the same layout and rhythm from
 * the catalog we actually have.
 *
 * One read serves both trees: the desktop magazine spread (featured annonce +
 * up to three runners) and the mobile carousel's backdrops. It renders nothing
 * when no published annonce has a photo, so an empty catalog gets no headless
 * frame — the rails below simply start the page, as they did before.
 */

type Row = {
  id: string;
  title: string;
  price: number | null;
  price_on_request: boolean;
  governorate: string;
  attributes: Record<string, unknown> | null;
  category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function cover(r: Row): string | null {
  const p = coverPhoto(r.photos);
  return p ? propertyPhotoUrl(p.storage_path) : null;
}

/** Display fields read from `attributes`, falling back to the title. */
function spec(r: Row) {
  const at = (r.attributes ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const mileageNum = Number(at.mileage);
  return {
    year: str(at.year),
    color: str(at.color),
    mileage: Number.isFinite(mileageNum) ? mileageNum : 0,
    headline: r.title,
  };
}

function priceLabel(r: Row, locale: string): string {
  return r.price_on_request || r.price == null
    ? "Prix sur demande"
    : `${formatTND(Number(r.price), locale)} TND`;
}

/**
 * Both trees are rendered on every request (CSS picks one), and both need the
 * same rows. `cache` makes that one query per request instead of two.
 */
const featuredAnnonces = cache(async (): Promise<Row[]> => {
  const admin = getServiceSupabase();
  if (!admin) return [];

  const SELECT = `id, title, price, price_on_request, governorate, attributes,
       featured_rank, featured_until,
       category:categories (label_fr, kind),
       photos:listing_photos (storage_path, sort_order, is_cover)`;

  // What the admin put à la une, in the order they chose. This used to be
  // `order by published_at` and nothing else — "featured" meant "posted most
  // recently", and no screen in the product could change it.
  const nowIso = new Date().toISOString();
  const { data: picked } = await admin
    .from("listings")
    .select(SELECT)
    .eq("status", "published")
    .not("featured_rank", "is", null)
    .or(`featured_until.is.null,featured_until.gt.${nowIso}`)
    .order("featured_rank", { ascending: true })
    .limit(12);

  // Then fill the rest, so the home page is never empty because nobody has
  // curated it yet — and so a lapsed placement degrades instead of leaving a
  // hole. `fallback` is an admin setting (0171).
  const chosen = (picked ?? []) as Row[];
  const need = 12 - chosen.length;
  let data = chosen;
  if (need > 0) {
    const { data: layout } = await admin
      .from("app_settings").select("value").eq("key", "home_layout").maybeSingle();
    const fallback = (layout?.value as { fallback?: string } | null)?.fallback ?? "recent";
    const fill = admin
      .from("listings")
      .select(SELECT)
      .eq("status", "published")
      .is("featured_rank", null)
      .limit(need);
    const { data: rest } = await (fallback === "viewed"
      ? fill.order("view_count", { ascending: false })
      : fill.order("published_at", { ascending: false }));
    data = [...chosen, ...((rest ?? []) as Row[])];
  }

  // Only rows we can actually show: a cover with no photo is a grey box.
  return ((data ?? []) as Row[]).filter((r) => cover(r) !== null);
});

/** The mobile cover. Renders nothing when no annonce has a photo. */
/**
 * The cover, on a phone.
 *
 * The phone and the desktop were telling different stories. Desktop opened
 * with the claim — "Le prix est affiché, le vendeur au bout du fil" — then the
 * featured annonce, its runners-up, and the catalogue drifting past. The phone
 * opened on a carousel of photographs with no words on them at all, so the one
 * sentence that says what Mazed IS never reached the readers who are most of
 * the traffic. It is the same story here now, in the order a phone reads.
 *
 * Not the same LAYOUT, though, which is the point:
 *
 *   • the headline drops from 44px to 28px and loses its `max-w-[20ch]`, which
 *     on a 375px screen was breaking it into five ragged lines;
 *   • the two calls to action are a full-width pair rather than a strip with a
 *     button pushed to the far edge;
 *   • the featured card is 4/3 rather than 16/10 — a wide crop on a narrow
 *     screen is a letterbox, and a car is taller than that;
 *   • the runners-up are thumbnail-beside-text rows, not posters with the
 *     title written over the photograph. Full-width on a phone that became
 *     white text on a blurred dashboard: the photo won and the words lost;
 *   • the drifting catalogue is ONE row, not two. A second row costs a third
 *     of the screen to say the same thing.
 */
export async function AnnonceCoverMobile() {
  const locale = await getLocale();
  const rows = await featuredAnnonces();
  if (rows.length === 0) return null;

  const featured = rows[0];
  const runners = rows.slice(1, 3);
  const marqueeCards: MarqueeCard[] = rows.map((r) => {
    const p = coverPhoto(r.photos)!;
    return {
      id: r.id,
      title: r.title,
      imagePath: p.storage_path,
      categoryLabel: one(r.category)?.label_fr ?? "À vendre",
      priceLabel: priceLabel(r, locale),
      governorate: r.governorate,
    };
  });

  return (
    <section className="lg:hidden">
      <div className="px-4 pt-5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
          <Sparkles className="size-3" />
          Mazed Auto
        </span>
        <h1 className="mt-2 text-[28px] font-black leading-[1.08] tracking-tight text-foreground">
          Le prix est affiché,{" "}
          <span className="gradient-gold-text">le vendeur au bout du fil</span>
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
          Voitures et pièces de rechange partout en Tunisie. Vous appelez le vendeur
          directement — nous vérifions l&apos;annonce avant qu&apos;elle soit en ligne.
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            href={"/annonces" as never}
            className="batta-btn-luxe tap-target inline-flex h-11 flex-1 items-center justify-center gap-1.5 text-[13.5px]"
          >
            Parcourir le catalogue
            <ArrowUpRight className="size-4" />
          </Link>
          <Link
            href={"/annonces?kind=part" as never}
            className="tap-target inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-gold-faint px-4 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft"
          >
            <Wrench className="size-3.5" />
            Pièces
          </Link>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Pièces de rechange : publication gratuite.
        </p>
      </div>

      <div className="mt-5 px-4">
        <span className="batta-eyebrow inline-flex items-center gap-1.5">
          <Sparkles className="size-3" /> À la une
        </span>
        <div className="mt-2.5">
          <FeaturedCard row={featured} locale={locale} compact />
        </div>
        {runners.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {runners.map((r) => (
              <MobileRow key={r.id} row={r} locale={locale} />
            ))}
          </ul>
        )}
      </div>

      {marqueeCards.length > 0 && (
        <div className="mt-6">
          <HeroMarquee cards={marqueeCards} rows={1} />
        </div>
      )}
    </section>
  );
}

/**
 * The runner-up, as a ROW rather than a poster.
 *
 * RunnerCard writes the title over the photo. That reads fine in a narrow
 * desktop column, where the image is small and dark; full-width on a phone it
 * became white text on a blurred dashboard — the photo won and the words lost.
 * A thumbnail beside solid-background text is the pattern every mobile
 * marketplace settled on, for this reason.
 */
function MobileRow({ row, locale }: { row: Row; locale: string }) {
  const cat = one(row.category);
  const img = cover(row)!;
  return (
    <li>
      <Link
        href={`/annonces/${row.id}` as never}
        className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-surface transition active:scale-[0.995]"
      >
        {/* Cover, like the rest of the cover block. At 92px square a contained
            portrait is a stamp between two dark bars, and next to a row that
            fills its square it just looks like the odd one out. */}
        <span className="relative size-[92px] shrink-0 bg-[#0f0f0f]">
          <ListingImage path={img} alt="" sizes="92px" fit="cover" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center py-2.5 pe-3">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted">
            {cat?.label_fr ?? ""}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground">
            {row.title}
          </span>
          <span className="batta-tabular mt-1 text-[14px] font-extrabold text-gold">
            {priceLabel(row, locale)}
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
            <MapPin className="size-3" /> {row.governorate}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The desktop magazine spread. */
export async function AnnonceHero() {
  const locale = await getLocale();
  const withPhoto = await featuredAnnonces();
  if (withPhoto.length === 0) return null;

  const featured = withPhoto[0];
  const runners = withPhoto.slice(1, 4);
  const backdrop = cover(featured)!;

  // Everything with a photo, not the first six: the banner this replaces showed
  // one annonce at a time, so eleven of the twelve were behind a timer.
  const marqueeCards: MarqueeCard[] = withPhoto.map((r) => {
    const p = coverPhoto(r.photos)!;
    return {
      id: r.id,
      title: r.title,
      imagePath: p.storage_path,
      categoryLabel: one(r.category)?.label_fr ?? "À vendre",
      priceLabel: priceLabel(r, locale),
      governorate: r.governorate,
    };
  });

  return (
      <section className="hidden lg:block relative isolate overflow-hidden">
        {/* Atmospheric backdrop — the featured car, blurred under a heavy
            gradient, so the hero is anchored in a real photo. */}
        <div className="absolute inset-0 -z-10" aria-hidden>
          {/* Deliberately tiny: this is blurred by 3xl and sat at 40% opacity,
              so a 128px variant is visually identical to a 1280px one and
              costs about 1KB. */}
          <ListingImage path={backdrop} alt="" sizes="128px" quality={50}
            fit="cover" className="scale-110 opacity-40 blur-3xl" />
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
          {/* Top strip */}
          <div className="mb-9 flex items-center justify-between gap-4">
            <Link
              href={"/annonces?kind=part" as never}
              className="inline-flex h-9 items-center gap-2.5 rounded-full bg-[var(--gold)]/10 px-3.5 ring-1 ring-[var(--gold-soft)]/40 backdrop-blur-md transition-all hover:ring-[var(--gold)]"
            >
              <Wrench className="h-3.5 w-3.5 text-[var(--gold)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
                Pièces de rechange · publication gratuite
              </span>
            </Link>

            <Link
              href={"/annonces" as never}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-sm font-bold text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:ring-[var(--gold)]"
            >
              Parcourir le catalogue
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Editorial headline */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--gold)]">
              <Sparkles className="h-3.5 w-3.5" />
              Mazed Auto · Sélection éditoriale
            </div>
            <h1 className="mt-3 max-w-[20ch] text-[44px] font-black leading-[1.02] tracking-tight xl:text-[56px]">
              Le prix est affiché,{" "}
              <span className="gradient-gold-text">le vendeur au bout du fil</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70 xl:text-base">
              Voitures et pièces de rechange partout en Tunisie. Vous appelez le
              vendeur directement — nous vérifions l&apos;annonce avant qu&apos;elle
              soit en ligne.
            </p>
          </div>

          {/* Featured + runners. With no runners the featured card spans the
              full width instead of leaving a gap on thin inventory. */}
          <div className={runners.length > 0 ? "grid grid-cols-[1.7fr_1fr] gap-6 xl:gap-7" : ""}>
            <FeaturedCard row={featured} locale={locale} />

            {runners.length > 0 && (
              <div
                className="grid gap-5 xl:gap-6"
                style={{ gridTemplateRows: `repeat(${runners.length}, minmax(0, 1fr))` }}
              >
                {runners.map((r) => (
                  <RunnerCard key={r.id} row={r} locale={locale} />
                ))}
              </div>
            )}
          </div>

          {/* The rest of the catalogue, drifting past. It sat ABOVE the
              headline, so the page opened on movement and the sentence that
              explains what Mazed is came second. The claim leads now; the
              stock follows it. */}
          {marqueeCards.length > 0 && (
            <div className="-mx-8 mt-12">
              <HeroMarquee cards={marqueeCards} />
            </div>
          )}
        </div>
      </section>
  );
}

function FeaturedCard({
  row, locale, compact = false,
}: { row: Row; locale: string; compact?: boolean }) {
  const { headline, year, color, mileage } = spec(row);
  const cat = one(row.category);
  const img = cover(row)!;

  return (
    <Link
      href={`/annonces/${row.id}` as never}
      className={
        "group relative block overflow-hidden ring-1 ring-white/10 transition-all hover:ring-[var(--gold)] " +
        (compact
          ? "aspect-[4/3] rounded-2xl shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]"
          : "aspect-[16/10] rounded-[28px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)]")
      }
    >
      <ListingImage
        path={img}
        alt={headline}
        sizes={compact ? "100vw" : "(min-width:1280px) 55vw, 60vw"}
        priority
        fit="cover"
        className="transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
      />
      {/* One smooth ramp instead of two crossed three-stop gradients. The old
          pair darkened the middle of the photo twice over and left a visible
          seam across it. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 18%, rgba(0,0,0,0.5) 38%, rgba(0,0,0,0.22) 58%, rgba(0,0,0,0.06) 78%, transparent 100%)",
        }}
      />

      <div className={"absolute inset-x-0 top-0 flex items-start justify-between gap-3 " + (compact ? "p-3" : "p-6")}>
        <span className={
          "inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)] font-extrabold uppercase tracking-wider text-black shadow-[var(--shadow-gold)] " +
          (compact ? "h-7 px-2.5 text-[10px]" : "h-8 px-3 text-[11px]")
        }>
          <Sparkles className={compact ? "size-3" : "h-3.5 w-3.5"} />
          À la une
        </span>
        {cat && (
          <span className={
            "inline-flex items-center rounded-full bg-black/60 font-bold text-white ring-1 ring-white/15 backdrop-blur-md " +
            (compact ? "h-7 px-2.5 text-[10.5px]" : "h-9 px-3.5 text-[12px]")
          }>
            {cat.label_fr}
          </span>
        )}
      </div>

      <div className={"absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 " + (compact ? "p-3.5" : "gap-6 p-7 xl:p-8")}>
        <div className="min-w-0 flex-1">
          <h2 className={
            "font-black leading-[1.02] tracking-tight text-white " +
            (compact ? "text-[22px]" : "text-[34px] xl:text-[42px]")
          }>
            {headline}
          </h2>
          <div className={
            "mt-1.5 flex items-center font-light text-white/75 " +
            (compact ? "flex-wrap gap-x-2 gap-y-1 text-[12px]" : "mt-2 gap-3 text-base xl:text-lg")
          }>
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
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Gauge className={compact ? "size-3.5" : "h-4 w-4"} />
                  {Intl.NumberFormat("fr-FR").format(mileage)} km
                </span>
              </>
            )}
            {compact && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <MapPin className="size-3.5 text-[var(--gold)]" />
                  {row.governorate}
                </span>
              </>
            )}
          </div>

          <div className={compact ? "mt-3 flex items-end gap-4" : "mt-5 flex items-end gap-7"}>
            <div>
              <div className={
                "font-bold uppercase tracking-[0.18em] text-white/60 " +
                (compact ? "text-[9px]" : "text-[10px]")
              }>
                Prix
              </div>
              <div className={
                "gradient-gold-text mt-1 font-black leading-none tabular-nums " +
                (compact ? "text-[26px]" : "text-4xl xl:text-[44px]")
              }>
                {row.price_on_request || row.price == null ? (
                  <span className={compact ? "text-[20px]" : "text-3xl xl:text-4xl"}>Sur demande</span>
                ) : (
                  <>
                    {formatTND(Number(row.price), locale)}
                    <span className="ms-2 align-middle text-[0.5em] font-extrabold uppercase tracking-[0.1em]">
                      TND
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className={
              "items-center gap-5 pb-1.5 text-white/85 " +
              (compact ? "hidden" : "hidden text-sm xl:flex")
            }>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className={compact ? "size-3.5 text-[var(--gold)]" : "h-4 w-4 text-[var(--gold)]"} />
                {row.governorate}
              </span>
            </div>
          </div>
        </div>

        <span className={
          "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--gold)] font-extrabold text-black shadow-[var(--shadow-gold)] transition-transform group-hover:scale-[1.04] active:scale-[0.99] " +
          (compact ? "h-10 px-4 text-[12.5px]" : "h-12 gap-2 px-6 text-sm")
        }>
          Voir l&apos;annonce
          <ArrowUpRight className={compact ? "size-3.5" : "h-4 w-4"} />
        </span>
      </div>
    </Link>
  );
}

function RunnerCard({ row, locale }: { row: Row; locale: string }) {
  const img = cover(row)!;
  const cat = one(row.category);

  return (
    <Link
      href={`/annonces/${row.id}` as never}
      className="group relative block overflow-hidden rounded-[22px] ring-1 ring-white/10 transition-all hover:ring-[var(--gold)]"
    >
      {/* `cover`. These cards are wide and short, and the default `contain`
          fitted portrait photos to the HEIGHT — so the car became a narrow
          vertical strip down the middle with a blurred smear either side. */}
      <ListingImage
        path={img}
        alt={row.title}
        sizes="(min-width:1280px) 28vw, 32vw"
        fit="cover"
        className="transition-transform duration-700 ease-out group-hover:scale-[1.05]"
      />
      {/* Darkened from the LEFT, not from the bottom.

          These cards are wide and short — about 480 by 150 — so a bottom-up
          ramp has to cover most of the card to reach the text, which buries the
          photo and still leaves the eyebrow sitting where the gradient has run
          out. Going sideways matches the shape: the words get a solid ground on
          the left, the car keeps the right half of the frame, and neither is
          fighting the other. Many stops, because three over a photograph show
          their own edges as bands. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.9) 26%, rgba(0,0,0,0.72) 44%, rgba(0,0,0,0.42) 62%, rgba(0,0,0,0.16) 80%, transparent 100%)",
        }}
      />

      <div className="relative flex h-full min-h-[132px] max-w-[68%] flex-col justify-center p-5">
        {cat && (
          <span className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
            {cat.label_fr}
          </span>
        )}
        <h3 className="line-clamp-1 text-[17px] font-extrabold leading-tight text-white">
          {row.title}
        </h3>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="batta-tabular text-[15px] font-black text-[var(--gold)]">
            {priceLabel(row, locale)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-white/70">
            <MapPin className="h-3 w-3" />
            {row.governorate}
          </span>
        </div>
      </div>
    </Link>
  );
}
