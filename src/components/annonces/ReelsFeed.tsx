"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ListingImage } from "@/components/media/ListingImage";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { useToast } from "@/components/ui/Toast";
import { formatTND } from "@/lib/utils";
import type { ReelItem } from "@/lib/catalog/query";
import {
  ArrowUpRight, BadgeCheck, Car, ChevronUp, ImageOff, Loader2,
  MapPin, Phone, Share2, Wrench,
} from "lucide-react";

/**
 * The catalog as a vertical feed — one annonce per screen, flicked through
 * the way a reel is.
 *
 * WHY IT IS NOT A GRID WITH BIGGER CARDS. A grid is for comparing: four cars
 * side by side, scanned on price. A feed is for discovering: one car, whole,
 * with nothing beside it to compare against, and the next one a flick away.
 * They answer different questions, which is why this is a VIEW toggle and not
 * a replacement — `?view=reels` sits alongside every existing filter and the
 * grid is still what `/annonces` opens on.
 *
 * WHAT MAKES IT READ AS A FEED RATHER THAN AS A TALL LIST:
 *
 *   · Scroll snapping, mandatory and per-item. Without `snap-always` a fast
 *     flick skips past two or three cards and lands between them, which is the
 *     single thing that makes a home-made feed feel wrong.
 *   · One card is ACTIVE at a time (IntersectionObserver, 60% visible). Only
 *     the active card loads its full photo set; the rest hold their cover.
 *   · Photos advance by tapping the left/right third or swiping sideways,
 *     with the segment bar every story UI has along the top.
 *   · The next page is already fetched by the time you reach it.
 *
 * WHAT IT DELIBERATELY KEEPS FROM THE REST OF THE SITE. The heart is the same
 * `FavoriteButton` the cards use, so a save here shows up there without a
 * reload; the number comes from the same rate-limited, logged
 * `/api/annonces/[id]/contact` the detail page uses, because that endpoint is
 * the reason a scraper cannot walk the catalog collecting phone numbers, and
 * a second path to the same data would quietly undo it.
 */

type Props = {
  initialItems: ReelItem[];
  initialSaved: string[];
  loggedIn: boolean;
  locale: string;
  /** Query string carrying the active filters, without `page`. */
  filterQuery: string;
  nextPage: number | null;
  total: number;
};

export function ReelsFeed({
  initialItems,
  initialSaved,
  loggedIn,
  locale,
  filterQuery,
  nextPage: initialNextPage,
  total,
}: Props) {
  const [items, setItems] = useState<ReelItem[]>(initialItems);
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialSaved));
  const [nextPage, setNextPage] = useState<number | null>(initialNextPage);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  // Guards against two fetches for the same page when the observer fires
  // twice in one frame — `loading` is state and does not update in time.
  const inFlight = useRef(false);

  // ── Paging ──────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (inFlight.current || nextPage == null) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const qs = new URLSearchParams(filterQuery);
      qs.set("page", String(nextPage));
      const res = await fetch(`/api/annonces/feed?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as {
        items: ReelItem[]; saved: string[]; nextPage: number | null;
      };
      setItems((prev) => {
        // The catalog can change under a feed that is minutes old; a listing
        // arriving twice would render two cards with the same React key.
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...j.items.filter((i) => !seen.has(i.id))];
      });
      if (j.saved.length) {
        setSaved((prev) => new Set([...prev, ...j.saved]));
      }
      setNextPage(j.nextPage);
    } catch {
      // Left silent on purpose: a failed page-3 fetch is not something to
      // interrupt someone mid-scroll about. The sentinel stays in place and
      // the next flick tries again.
      inFlight.current = false;
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [filterQuery, nextPage]);

  // The observer needs the CURRENT loadMore and item count without being torn
  // down and rebuilt every time either changes — re-observing twelve elements
  // on each appended page is both wasteful and a source of duplicate fires.
  //
  // Written in an effect rather than during render. A ref assigned mid-render
  // is a write the renderer may replay or discard, and the observer only reads
  // these later, on a scroll, by which time the effect has long run.
  const loadMoreRef = useRef(loadMore);
  const countRef = useRef(items.length);
  useEffect(() => {
    loadMoreRef.current = loadMore;
    countRef.current = items.length;
  });

  // ── Which card is on screen ─────────────────────────────────────────────
  // Paging is kicked off from HERE, in the observer callback, rather than from
  // an effect watching `active`: scrolling is an external event, and reacting
  // to it where it happens avoids a render pass whose only job is to notice
  // that a number changed.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.index);
          if (!Number.isFinite(i)) continue;
          setActive(i);
          // Three cards ahead of the end, not at it, so the next page is
          // already in place by the time it is flicked to.
          if (i >= countRef.current - 3) void loadMoreRef.current();
        }
      },
      { root, threshold: 0.6 },
    );
    for (const el of itemRefs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  // ── Keyboard, for the desktop half of the audience ──────────────────────
  const scrollTo = useCallback((i: number) => {
    const el = itemRefs.current[i];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        scrollTo(Math.min(active + 1, items.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        scrollTo(Math.max(active - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, scrollTo]);

  if (items.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
      // `data-prevent-pull-to-refresh`: the shell's pull-to-refresh triggers on
      // a downward drag whenever `window.scrollY` is 0, and it always is here —
      // the page body never scrolls, this element does. Without the opt-out,
      // flicking back to the previous reel reloads the route instead.
      data-prevent-pull-to-refresh
      className="hide-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {items.map((item, i) => (
        <Reel
          key={item.id}
          item={item}
          index={i}
          active={i === active}
          near={Math.abs(i - active) <= 1}
          loggedIn={loggedIn}
          initialSaved={saved.has(item.id)}
          locale={locale}
          ref={(el) => { itemRefs.current[i] = el; }}
        />
      ))}

      {/* Tail: either the loader for the next page, or the end of the feed. */}
      <div className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 px-8 text-center">
        {loading || nextPage != null ? (
          <>
            <Loader2 className="size-6 animate-spin text-gold" />
            <p className="text-[13px] text-muted">Chargement…</p>
          </>
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
              <ChevronUp className="size-6" />
            </span>
            <p className="text-[15px] font-bold text-foreground">
              Vous avez tout vu
            </p>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted">
              {total} annonce{total > 1 ? "s" : ""} au total. Remontez pour les revoir,
              ou changez les filtres.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

const Reel = function Reel({
  item, index, active, near, loggedIn, initialSaved, locale, ref,
}: {
  item: ReelItem;
  index: number;
  active: boolean;
  /** The card before and after the active one keep their photo mounted. */
  near: boolean;
  loggedIn: boolean;
  initialSaved: boolean;
  locale: string;
  ref: (el: HTMLElement | null) => void;
}) {
  const { toast } = useToast();
  const [photo, setPhoto] = useState(0);
  const [phone, setPhone] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const touchX = useRef<number | null>(null);

  const photos = item.photos;
  const many = photos.length > 1;

  // Flicking away and back should start the annonce over, the way leaving a
  // story and returning does — not resume on photo 4 of 6.
  //
  // Adjusted during render rather than in an effect: the reset then lands on
  // the SAME paint that hides the card, instead of one frame later, and the
  // card cannot be seen flicking back to its first photo on the way out.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setPhoto(0);
  }

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!many) return;
      setPhoto((p) => Math.min(photos.length - 1, Math.max(0, p + dir)));
    },
    [many, photos.length],
  );

  async function reveal() {
    setRevealing(true);
    try {
      const res = await fetch(`/api/annonces/${item.id}/contact`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? "Numéro indisponible.", res.status === 429 ? "warning" : "error");
        return;
      }
      setPhone(j.phone as string);
    } catch {
      toast("Erreur réseau.", "error");
    } finally {
      setRevealing(false);
    }
  }

  async function share() {
    const url = `${window.location.origin}/${locale}/annonces/${item.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Lien copié.", "success");
    } catch {
      // A cancelled share sheet rejects; that is not an error worth a toast.
    }
  }

  const price =
    item.priceOnRequest || item.price == null
      ? "Sur demande"
      : `${formatTND(item.price, locale)} TND`;

  return (
    <article
      ref={ref}
      data-index={index}
      className="relative h-full w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* The photo. `contain` on the component's own dark gradient, not
          `cover`: a portrait phone shot of a car cropped to fill a landscape
          screen loses the roof and the wheels, and this is the one screen
          where looking at the photo IS the activity. */}
      <div className="absolute inset-0">
        {photos.length === 0 ? (
          <span className="grid size-full place-items-center text-muted">
            <ImageOff className="size-8" />
          </span>
        ) : (
          photos.map((p, pi) => {
            // Mount the visible photo, its neighbour (so a tap is instant),
            // and nothing at all for cards that are off screen.
            if (!near) return pi === 0 ? mount(p, pi) : null;
            if (Math.abs(pi - photo) > 1) return null;
            return mount(p, pi);
          })
        )}
      </div>

      {/* Scrims. Two, not one: the top one carries the segment bar, the bottom
          one carries the title and price over whatever the seller photographed. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {/* Story segments. */}
      {many && (
        <div className="absolute inset-x-0 top-0 flex gap-1 px-3 pt-3">
          {photos.map((p, pi) => (
            <span key={p} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                className={`block h-full rounded-full bg-white transition-[width] duration-300 ${
                  pi <= photo ? "w-full" : "w-0"
                }`}
              />
            </span>
          ))}
        </div>
      )}

      {/* Tap zones — the left and right thirds page the photos, exactly where
          a thumb already expects them. The middle is left alone so the card
          below stays reachable. */}
      {many && (
        <div
          className="absolute inset-0 flex"
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            if (start == null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
          }}
        >
          <button type="button" aria-label="Photo précédente" className="h-full w-1/3" onClick={() => step(-1)} />
          <span className="h-full w-1/3" />
          <button type="button" aria-label="Photo suivante" className="h-full w-1/3" onClick={() => step(1)} />
        </div>
      )}

      {/* Right rail — save, share, call. */}
      <div className="absolute end-3 bottom-32 z-10 flex flex-col items-center gap-4">
        <RailAction label="Enregistrer">
          <FavoriteButton
            listingId={item.id}
            initialSaved={initialSaved}
            loggedIn={loggedIn}
            size="md"
            className="size-12 border-white/25 bg-black/45 text-white backdrop-blur-md"
          />
        </RailAction>

        <RailAction label="Partager">
          <button
            type="button"
            onClick={share}
            aria-label="Partager cette annonce"
            className="inline-flex size-12 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-md transition active:scale-95"
          >
            <Share2 className="size-5" strokeWidth={2} />
          </button>
        </RailAction>

        <RailAction label={phone ? "Appeler" : "Numéro"}>
          {phone ? (
            <a
              href={`tel:${phone}`}
              aria-label={`Appeler ${phone}`}
              className="batta-gold-fill gold-rim inline-flex size-12 items-center justify-center rounded-full transition active:scale-95"
            >
              <Phone className="size-5" strokeWidth={2.4} />
            </a>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={revealing}
              aria-label="Afficher le numéro du vendeur"
              className="inline-flex size-12 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-md transition active:scale-95 disabled:opacity-60"
            >
              {revealing
                ? <Loader2 className="size-5 animate-spin" />
                : <Phone className="size-5" strokeWidth={2} />}
            </button>
          )}
        </RailAction>
      </div>

      {/* The annonce itself. */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-4 pe-20 pb-6">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/70">
          {item.isPart ? <Wrench className="size-3" /> : <Car className="size-3" />}
          {item.categoryLabel}
          {item.sellerVerified && (
            <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 backdrop-blur-sm">
              <BadgeCheck className="size-3 text-gold" /> vérifié
            </span>
          )}
        </span>

        <h2 className="mt-1.5 line-clamp-2 text-[19px] font-extrabold leading-tight tracking-tight text-white">
          {item.title}
        </h2>

        {item.specs.length > 0 && (
          <p className="mt-1 line-clamp-1 text-[12.5px] text-white/70">
            {item.specs.join(" · ")}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="batta-tabular text-[24px] font-black leading-none text-gold">
            {price}
          </span>
          {item.negotiable && !item.priceOnRequest && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
              négociable
            </span>
          )}
        </div>

        {/* `flex`, not the `inline-flex` this was: an inline-flex <p> is only
            as wide as its text, so the CTA below — also inline-flex, via
            .batta-btn-luxe — flowed up onto the same line and sat on top of
            the governorate. */}
        <p className="mt-1.5 flex w-fit items-center gap-1 text-[12px] text-white/70">
          <MapPin className="size-3.5" /> {item.governorate}
        </p>

        {phone && (
          <p className="batta-tabular mt-2 text-[13px] font-bold text-white">{phone}</p>
        )}

        <Link
          href={`/annonces/${item.id}` as never}
          className="batta-btn-luxe mt-3.5 flex h-11 w-fit px-5 text-[13.5px]"
        >
          Voir l&apos;annonce
          <ArrowUpRight className="size-4" strokeWidth={2.5} />
        </Link>
      </div>
    </article>
  );

  function mount(path: string, pi: number) {
    return (
      <div
        key={path}
        aria-hidden={pi !== photo}
        className={`absolute inset-0 transition-opacity duration-200 ${
          pi === photo ? "opacity-100" : "opacity-0"
        }`}
      >
        <ListingImage
          path={path}
          alt={pi === photo ? item.title : ""}
          sizes="(min-width:1024px) 420px, 100vw"
          priority={active && pi === 0}
          quality={72}
        />
      </div>
    );
  }
};

/** An icon button with its caption underneath, the way every feed labels one. */
function RailAction({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1">
      {children}
      <span className="text-[9.5px] font-bold text-white/75 drop-shadow">{label}</span>
    </span>
  );
}
