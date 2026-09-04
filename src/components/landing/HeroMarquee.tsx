import { Link } from "@/i18n/navigation";
import { ListingImage } from "@/components/media/ListingImage";
import { MapPin } from "lucide-react";

/**
 * The home cover: every annonce we want to show, drifting past.
 *
 * It replaces a one-slide-at-a-time carousel. That banner gave a single car the
 * whole width of the screen and hid the other eleven behind an auto-advance you
 * had to wait out — a catalogue that shows one thing at a time is not showing a
 * catalogue. Two rows drifting in opposite directions put eight or nine cars on
 * screen at once and say "there is a lot here" without anybody clicking.
 *
 * NO JAVASCRIPT. The banner it replaces is a client component with pointer
 * capture, drag maths, snap thresholds, a suppressed-click guard and an
 * auto-advance timer. This is a CSS animation on a server-rendered list. It
 * pauses on hover and stops entirely under `prefers-reduced-motion`, both from
 * rules `.batta-marquee` already carries.
 *
 * HOW THE LOOP IS SEAMLESS. The animation translates the track by exactly -50 %,
 * so the track must hold the same cards twice: at -50 % the second copy sits
 * precisely where the first began and the restart is invisible. The duplicate is
 * `aria-hidden` and unfocusable — it is the same content, and a screen reader
 * or a Tab key should meet each annonce once.
 *
 * Spacing is per-card padding rather than a flex `gap`, because a gap is only
 * drawn BETWEEN items: there is none after the last one, so the join between the
 * two copies would be one gap short and the row would visibly hitch once per
 * lap.
 */

export type MarqueeCard = {
  id: string;
  title: string;
  imagePath: string;
  categoryLabel: string;
  priceLabel: string;
  governorate: string;
};

/** Card width + its padding, in px. Only used to decide how many copies. */
const CARD_W = 248 + 12;
/** Wider than any viewport we care about, so a short catalogue still fills. */
const MIN_TRACK = 2400;

/**
 * Repeat the cards until one copy of the track is wider than the screen.
 * With four annonces the row would otherwise be ~1 000px, and half of a
 * 2 000px track scrolling across a 1 600px monitor leaves visible emptiness.
 */
function fill(cards: MarqueeCard[]): MarqueeCard[] {
  if (cards.length === 0) return [];
  const reps = Math.max(1, Math.ceil(MIN_TRACK / (cards.length * CARD_W)));
  return Array.from({ length: reps }, () => cards).flat();
}

export function HeroMarquee({ cards }: { cards: MarqueeCard[] }) {
  if (cards.length === 0) return null;

  // Two rows going opposite ways. One row of everything reads as a conveyor;
  // two moving against each other reads as a lot of stock.
  const half = Math.ceil(cards.length / 2);
  const top = fill(cards.slice(0, half));
  const bottom = fill(cards.slice(half).length > 0 ? cards.slice(half) : cards.slice(0, half));

  return (
    <div className="relative overflow-hidden py-1">
      {/* The rows run edge to edge; these dissolve them rather than letting a
          card be sliced off mid-air at the boundary. Wider than one card, so a
          card fades out over its whole width instead of being half-dimmed and
          half-bright — which read as a broken card rather than as a fade. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[280px] bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[280px] bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/85 to-transparent" />

      <ul className="batta-marquee">
        {top.map((c, i) => (
          <Card key={`t-a-${i}-${c.id}`} card={c} />
        ))}
        {top.map((c, i) => (
          <Card key={`t-b-${i}-${c.id}`} card={c} clone />
        ))}
      </ul>

      <ul className="batta-marquee-reverse mt-3">
        {bottom.map((c, i) => (
          <Card key={`b-a-${i}-${c.id}`} card={c} />
        ))}
        {bottom.map((c, i) => (
          <Card key={`b-b-${i}-${c.id}`} card={c} clone />
        ))}
      </ul>
    </div>
  );
}

function Card({ card, clone = false }: { card: MarqueeCard; clone?: boolean }) {
  return (
    <li className="w-[248px] shrink-0 px-1.5" aria-hidden={clone || undefined}>
      <Link
        href={`/annonces/${card.id}` as never}
        tabIndex={clone ? -1 : undefined}
        className="group block overflow-hidden rounded-2xl bg-[#141414] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.07] transition duration-300 hover:ring-[var(--gold-soft)]"
      >
        {/* `cover`, not the site-wide `contain`.

            Everywhere a buyer is studying a car the photo is shown whole, over
            a blurred copy of itself, because cropping loses what they came to
            see. Here that was the wrong call and it looked it: sellers shoot
            both ways, so a row of contained photos is a row of portraits
            floating in smeared orange and grey bands, no two cards alike. This
            is a cover — decoration, one click from the real thing — so every
            card fills its frame identically and the row reads as one surface.
            Nothing is lost: the photo is shown whole on the annonce itself. */}
        <div className="relative aspect-[4/3] overflow-hidden bg-[#0f0f0f]">
          <ListingImage
            path={card.imagePath}
            alt={clone ? "" : card.title}
            sizes="248px"
            fit="cover"
            className="transition duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <div className="p-3">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[var(--gold)]">
            {card.categoryLabel}
          </span>
          <h3 className="mt-1 truncate text-[13px] font-bold leading-snug text-white">
            {card.title}
          </h3>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="batta-tabular text-[14px] font-extrabold text-white">
              {card.priceLabel}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-white/45">
              <MapPin className="size-2.5" /> {card.governorate}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
