"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, BadgeCheck, Car, Tag, Wrench } from "lucide-react";

/**
 * The mobile cover — an auto-cycling carousel of value props laid over real
 * annonce photos, with a top progress bar that sweeps in time with the timer.
 *
 * This is the v3 successor to PromoHero. The machinery is the same because the
 * user liked it ("the layout was nice and felt alive"); what changed is what it
 * says and what it stands on. The old slides sold bidding, a refundable deposit
 * and KYC — three things v3 does not have — over auction photos, so when the
 * auction blocks went dark the hero went with them and the page lost its top.
 * Now the backdrops come from published annonces and the copy describes the
 * marketplace we actually run.
 */

type Slide = {
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  /** Signature gradient laid over the photo so the copy stays legible. */
  tint: string;
};

const SLIDES: Slide[] = [
  {
    Icon: Car,
    eyebrow: "Voitures à prix fixe",
    title: "Le prix est affiché",
    subtitle: "Pas d'enchère, pas d'attente — vous appelez le vendeur directement",
    href: "/annonces",
    cta: "Voir les voitures",
    tint: "from-black/85 via-[#1a1409]/70 to-black/40",
  },
  {
    Icon: Wrench,
    eyebrow: "Pièces de rechange",
    title: "La pièce qui va sur votre voiture",
    subtitle: "Cherchez par marque, modèle et année — la compatibilité est vérifiée",
    href: "/annonces?kind=part",
    cta: "Chercher une pièce",
    tint: "from-black/85 via-[#09141a]/70 to-black/40",
  },
  {
    Icon: BadgeCheck,
    eyebrow: "Diagnostic Mazed",
    title: "Vérifié et approuvé",
    subtitle: "Nos équipes inspectent la voiture et publient la fiche complète",
    href: "/how-it-works",
    cta: "Comment ça marche",
    tint: "from-black/85 via-[#0a1a14]/70 to-black/40",
  },
  {
    Icon: Tag,
    eyebrow: "Pièces : publication gratuite",
    title: "Vendez vos pièces sans frais",
    subtitle: "Publier une pièce de rechange ne coûte rien, autant qu'elle serve",
    href: "/annonces/nouvelle",
    cta: "Publier une pièce",
    tint: "from-black/85 via-[#11091a]/70 to-black/40",
  },
  {
    Icon: ArrowRight,
    eyebrow: "Vendez votre voiture",
    title: "En ligne en quelques minutes",
    subtitle: "Vos coordonnées sur l'annonce : les acheteurs vous appellent, vous décidez",
    href: "/annonces/nouvelle",
    cta: "Publier une annonce",
    tint: "from-black/85 via-[#1a0a09]/70 to-black/40",
  },
];

export function AnnonceHeroCarousel({
  photos,
  intervalMs = 4000,
}: {
  /** Cover photos from published annonces, already resolved to URLs. */
  photos: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // One backdrop per slide, wrapping when the catalog is thin. A slide with no
  // photo falls back to its gradient rather than rendering an empty frame.
  const backdrops = SLIDES.map((_, i) =>
    photos.length ? photos[i % photos.length] : null,
  );

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs]);

  return (
    <section className="px-4 pt-4" aria-roledescription="carousel" aria-label="Mises en avant">
      {/* dir=ltr keeps the translateX slide maths correct under RTL locales. */}
      <div
        dir="ltr"
        className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--gold-soft)]/30"
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Progress bar — sweeps in time with the interval so the carousel
            reads as moving on purpose rather than jumping. */}
        <div className="absolute inset-x-0 top-0 z-20 h-0.5 bg-white/10">
          <div
            key={index}
            className="h-full bg-[var(--gold)]"
            style={{
              animation: paused ? "none" : `batta-hero-sweep ${intervalMs}ms linear forwards`,
            }}
          />
        </div>

        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s, i) => {
            const bg = backdrops[i];
            return (
              <Link
                key={s.eyebrow}
                href={s.href as never}
                className="relative block w-full shrink-0"
                aria-hidden={i !== index}
                tabIndex={i === index ? 0 : -1}
              >
                <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
                  {bg ? (
                    <Image
                      src={bg}
                      alt=""
                      fill
                      // The cover spans the viewport on phones and is capped by
                      // the content column above that.
                      sizes="(min-width:640px) 640px, 100vw"
                      quality={72}
                      priority={i === 0}
                      loading={i === 0 ? undefined : "lazy"}
                      className="object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a1409] to-black" />
                  )}
                  <div className={`absolute inset-0 bg-gradient-to-t ${s.tint}`} />

                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--gold)] ring-1 ring-[var(--gold-soft)]/40 backdrop-blur-sm">
                      <s.Icon className="size-3" />
                      {s.eyebrow}
                    </span>
                    <h2 className="mt-2 text-[22px] font-black leading-[1.08] tracking-tight text-white">
                      {s.title}
                    </h2>
                    <p className="mt-1 max-w-[34ch] text-[12.5px] leading-snug text-white/75">
                      {s.subtitle}
                    </p>
                    <span className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--gold)] px-4 text-[12.5px] font-extrabold text-black shadow-[var(--shadow-gold)]">
                      {s.cta}
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Dots */}
        <div className="absolute inset-x-0 bottom-1.5 z-20 flex justify-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.eyebrow}
              onClick={() => setIndex(i)}
              aria-label={`Aller à « ${s.eyebrow} »`}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === index ? "w-5 bg-[var(--gold)]" : "w-1.5 bg-white/40")
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
