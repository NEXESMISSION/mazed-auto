"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  ShieldCheck,
  Gavel,
  TrendingUp,
  Lock,
  Award,
  ArrowRight,
} from "lucide-react";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import type { AuctionWithProperty } from "@/lib/types";

/**
 * Mobile promo hero — a v2 port of the original mazed-auto PromoBanner. An
 * auto-cycling carousel of value-prop slides, each laid over a real live-auction
 * photo under a per-slide tinted gradient, with gold accents, a top progress
 * bar that sweeps in sync with the timer, and centered gold pill dots. This is
 * the "sharper" mobile hero the user preferred over the brand/stat panel — it
 * leads with cars + trust messaging. Desktop keeps its own cinematic
 * DesktopHero (already the v1 magazine spread), so this is rendered mobile-side.
 */

type Promo = {
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  subtitle: string;
  href: "/properties" | "/how-it-works" | "/sell";
  cta: string;
  /** Signature gradient laid over the photo so copy stays legible. */
  tint: string;
};

const PROMOS: Promo[] = [
  {
    Icon: Gavel,
    eyebrow: "Enchères en cours",
    title: "Misez en temps réel",
    subtitle: "Des dizaines de voitures vérifiées en cours d'enchère",
    href: "/properties",
    cta: "Voir les enchères",
    tint: "from-black/85 via-[#1a1409]/70 to-black/40",
  },
  {
    Icon: ShieldCheck,
    eyebrow: "Verrou doré",
    title: "Vendeurs vérifiés",
    subtitle: "KYC humain + carte grise — la fraude détectée avant publication",
    href: "/how-it-works",
    cta: "Comment ça marche",
    tint: "from-black/85 via-[#0a1a14]/70 to-black/40",
  },
  {
    Icon: Lock,
    eyebrow: "Dépôt sécurisé",
    title: "Vos fonds sont protégés",
    subtitle: "Caution remboursable, paiement bloqué jusqu'à la livraison",
    href: "/how-it-works",
    cta: "En savoir plus",
    tint: "from-black/85 via-[#11091a]/70 to-black/40",
  },
  {
    Icon: TrendingUp,
    eyebrow: "Commission 3%",
    title: "Vendez sans frais cachés",
    subtitle: "5 étapes simples, des milliers d'acheteurs sérieux",
    href: "/sell",
    cta: "Commencer à vendre",
    tint: "from-black/85 via-[#1a0a09]/70 to-black/40",
  },
  {
    Icon: Award,
    eyebrow: "Confiance",
    title: "Notes & avis transparents",
    subtitle: "Chaque vendeur a un score basé sur ses ventes réelles",
    href: "/properties",
    cta: "Découvrir les voitures",
    tint: "from-black/85 via-[#091418]/70 to-black/40",
  },
];

export function PromoHero({
  pool,
  intervalMs = 3500,
}: {
  /** Live auctions — the first photos become the slide backdrops. */
  pool: AuctionWithProperty[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // One backdrop per slide, pulled from the pool (wrapping if short). Gradient
  // fallback when a slide has no photo so the hero never renders empty.
  const images: (string | null)[] = PROMOS.map((_, i) => {
    const a = pool[i] ?? (pool.length ? pool[i % pool.length] : undefined);
    const photo = a?.property?.photos
      ?.slice()
      .sort((p, q) => p.sort_order - q.sort_order)[0];
    return photo ? propertyPhotoUrl(photo.storage_path) : null;
  });

  useEffect(() => {
    if (paused) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % PROMOS.length),
      intervalMs,
    );
    return () => clearInterval(t);
  }, [paused, intervalMs]);

  return (
    <section
      className="px-4 pt-4"
      aria-roledescription="carousel"
      aria-label="Mises en avant"
    >
      {/* dir=ltr keeps the translateX slide math correct under RTL locales;
          the slide copy is French (matching the rest of the home headings). */}
      <div
        dir="ltr"
        className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--gold-soft)]/30"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {PROMOS.map((p, i) => (
            <Slide
              key={i}
              promo={p}
              image={images[i]}
              active={i === index}
              hue={i}
              eager={i === 0}
            />
          ))}
        </div>

        {/* Dots — active is a wide gold pill. */}
        <div className="absolute inset-x-0 bottom-2.5 z-10 flex justify-center gap-1.5">
          {PROMOS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Diapositive ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? "w-5 bg-[var(--gold)]"
                  : "w-1.5 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>

        {/* Top progress bar — sweeps once per interval, resets via key. */}
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-white/10">
          <div
            key={`${index}-${paused}`}
            className="h-full bg-[var(--gold)]"
            style={{
              animation: paused
                ? "none"
                : `batta-promo-progress ${intervalMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function Slide({
  promo,
  image,
  active,
  hue,
  eager,
}: {
  promo: Promo;
  image: string | null;
  active: boolean;
  hue: number;
  eager: boolean;
}) {
  const { Icon } = promo;
  // Decorative hue-rotated fallback so each slide stays distinct with no photo.
  const fallbackBg = `conic-gradient(from 210deg at 30% 30%, hsl(${
    (hue * 53) % 360
  } 40% 18%), #050505)`;

  return (
    <Link
      // Typed-routes Link: some static pathnames (e.g. /how-it-works) aren't
      // in the generated Pathnames union, so cast like the rest of the app.
      href={promo.href as never}
      className="relative block aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-[21/9] lg:aspect-[12/4]"
      aria-roledescription="slide"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[1500ms] ease-out ${
            active ? "scale-105" : "scale-100"
          }`}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: fallbackBg }} />
      )}

      {/* Per-slide tint for copy legibility. */}
      <div className={`absolute inset-0 bg-gradient-to-tr ${promo.tint}`} aria-hidden />

      <div className="relative z-[1] flex h-full flex-col justify-end p-5 sm:p-7">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--gold)]/40 bg-[var(--gold-faint)]">
            <Icon className="h-3.5 w-3.5 text-[var(--gold)]" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
            {promo.eyebrow}
          </span>
        </div>
        <h2 className="max-w-[85%] text-xl font-extrabold tracking-tight text-white sm:text-2xl lg:text-3xl">
          {promo.title}
        </h2>
        <p className="mt-1 max-w-[85%] text-[12px] leading-snug text-white/80 sm:text-sm">
          {promo.subtitle}
        </p>
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 text-[12px] font-bold text-[var(--gold)]">
          {promo.cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
