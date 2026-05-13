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
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

interface Props {
  /**
   * Pool of active auctions — the banner picks the first N images from this
   * list for the slideshow background. If empty (cold start, fresh DB), the
   * promo cards still render with a gradient-only background.
   */
  pool: Auction[];
  /** Cycle interval in milliseconds. Default 1500ms per the design brief. */
  intervalMs?: number;
}

const promos: {
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  // Each slide owns a tinted overlay on top of the auction image so the
  // copy stays legible regardless of which photo lands behind it.
  tint: string;
}[] = [
  {
    Icon: Gavel,
    eyebrow: "Enchères en direct",
    title: "Misez en temps réel",
    subtitle: "Des dizaines de voitures vérifiées en cours d'enchère",
    href: "/auctions",
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
    href: "/register?role=seller",
    cta: "Commencer à vendre",
    tint: "from-black/85 via-[#1a0a09]/70 to-black/40",
  },
  {
    Icon: Award,
    eyebrow: "Acheteurs fidèles",
    title: "Notes & avis transparents",
    subtitle: "Chaque vendeur a un score basé sur ses ventes réelles",
    href: "/sellers",
    cta: "Découvrir les vendeurs",
    tint: "from-black/85 via-[#091418]/70 to-black/40",
  },
];

/**
 * Auto-cycling promotional banner. One slide every `intervalMs` (default 1s),
 * smooth horizontal slide-in. Each card stacks an auction photo (when
 * available) under a coloured tint and a promo headline. Pause on hover so
 * the user can read.
 */
export function PromoBanner({ pool, intervalMs = 1500 }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Pull as many distinct auction images as we have promo slides — fall back
  // to gradient-only when the pool is shorter.
  const images: (string | null)[] = promos.map((_, i) => {
    const a = pool[i] ?? pool[i % Math.max(pool.length, 1)];
    return a?.vehicle.imageUrls?.[0] ?? null;
  });

  useEffect(() => {
    if (paused) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % promos.length),
      intervalMs,
    );
    return () => clearInterval(t);
  }, [paused, intervalMs]);

  return (
    <section
      className="px-4 mt-5"
      aria-roledescription="carousel"
      aria-label="Mises en avant"
    >
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-[var(--gold-soft)]/30 bg-black"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* Slide track — one panel per slide, translated by the active index.
            duration-700 keeps the slide motion smooth even when intervalMs is
            short (1s). */}
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {promos.map((p, i) => (
            <Slide
              key={i}
              promo={p}
              image={images[i]}
              active={i === index}
              fallbackHue={i}
            />
          ))}
        </div>

        {/* Dots */}
        <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 z-10">
          {promos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Aller à la diapositive ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? "w-5 bg-[var(--gold)]"
                  : "w-1.5 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>

        {/* Auto-advance progress bar — completes its sweep just as the next
            slide kicks in, telegraphing the rhythm to the user. */}
        <div className="absolute top-0 inset-x-0 h-0.5 bg-white/10 z-10 overflow-hidden">
          <div
            key={`${index}-${paused}`}
            className="h-full bg-[var(--gold)]"
            style={{
              animation: paused
                ? "none"
                : `promo-progress ${intervalMs}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <style jsx global>{`
        @keyframes promo-progress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

function Slide({
  promo,
  image,
  active,
  fallbackHue,
}: {
  promo: (typeof promos)[number];
  image: string | null;
  active: boolean;
  fallbackHue: number;
}) {
  const { Icon } = promo;
  // Decorative-only fallback when no auction image is available — uses a hue
  // rotation so each slide still feels distinct.
  const fallbackBg = `conic-gradient(from 210deg at 30% 30%, hsl(${
    (fallbackHue * 53) % 360
  } 40% 18%), #050505)`;

  return (
    <Link
      href={promo.href}
      className="relative block w-full shrink-0 aspect-[16/9] sm:aspect-[21/9] overflow-hidden"
      aria-roledescription="slide"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb(image, { width: 1200, quality: 70 })}
          srcSet={`${thumb(image, { width: 720, quality: 65 })} 720w, ${thumb(image, { width: 1200, quality: 70 })} 1200w, ${thumb(image, { width: 1600, quality: 70 })} 1600w`}
          sizes="(max-width: 768px) 100vw, 1200px"
          alt=""
          /* First slide is the hero — eager + high priority. Other
             slides stay lazy so the browser doesn't burn bandwidth
             on slides the user may never scroll to. React maps
             fetchPriority → the HTML fetchpriority attribute. */
          loading={fallbackHue === 0 ? "eager" : "lazy"}
          fetchPriority={fallbackHue === 0 ? "high" : "auto"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[1500ms] ease-out ${
            active ? "scale-105" : "scale-100"
          }`}
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: fallbackBg }}
        />
      )}

      {/* Tint layer — reads the slide's signature gradient on top of the
          photo so the copy stays high-contrast. */}
      <div
        className={`absolute inset-0 bg-gradient-to-tr ${promo.tint}`}
        aria-hidden
      />

      <div className="relative z-[1] h-full p-5 sm:p-7 flex flex-col justify-end">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-7 w-7 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/40 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-[var(--gold)]" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
            {promo.eyebrow}
          </span>
        </div>
        <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white max-w-[80%]">
          {promo.title}
        </h3>
        <p className="mt-1 text-[12px] sm:text-sm text-white/80 leading-snug max-w-[80%]">
          {promo.subtitle}
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--gold)] w-fit">
          {promo.cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}
