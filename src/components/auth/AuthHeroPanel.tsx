import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, Eye, Zap, Star, Sparkles } from "lucide-react";

/**
 * Desktop-only split-screen brand panel for the auth pages.
 *
 * A pure black→gold gradient panel (no photo) with the gold "MA" mark,
 * the brand promise, three trust points and a slim social-proof line —
 * matching v1's auth marketing pane. The previous version used a
 * real-estate stock photo (a white seaside house), which was a leftover
 * from the land codebase and completely off-brand for a car auction.
 * Rendered only inside the `hidden lg:grid` tree, so phones never load it.
 */
const FEATURES = [
  { Icon: ShieldCheck, title: "100% sécurisé", sub: "Transactions vérifiées" },
  { Icon: Eye, title: "Transparence totale", sub: "Carte grise contrôlée" },
  { Icon: Zap, title: "Simple et rapide", sub: "Enchérissez en quelques clics" },
];

export function AuthHeroPanel() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#1a1408] via-surface to-black">
      {/* Decorative gold glow — the brand "weight" without a photo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -end-32 h-96 w-96 rounded-full bg-[var(--gold)] opacity-15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -start-40 h-[28rem] w-[28rem] rounded-full bg-[var(--gold)] opacity-10 blur-3xl"
      />

      <div className="relative flex h-full flex-col justify-between p-12">
        {/* Brand — round MA monogram + gold wordmark */}
        <Link href="/" className="inline-flex w-fit items-center gap-3" aria-label="Mazed Auto">
          <span className="size-11 shrink-0 overflow-hidden rounded-full ring-2 ring-[var(--gold)]/40 shadow-[var(--shadow-gold)]">
            <Image
              src="/logo.webp"
              alt=""
              width={88}
              height={88}
              priority
              sizes="44px"
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-2xl font-black tracking-tight gradient-gold-text">
            Mazed Auto
          </span>
        </Link>

        {/* Headline + trust points + social proof */}
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--gold)]">
            <Sparkles className="size-3.5" strokeWidth={2.2} />
            Enchères vérifiées · Tunisie
          </div>
          <h2 className="mt-3 text-balance text-[34px] font-extrabold leading-[1.1] tracking-tight text-white">
            La plateforme d&apos;<span className="gradient-gold-text">enchères automobiles</span>.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/70">
            Achetez et vendez votre voiture en toute confiance — identités
            vérifiées des deux côtés, carte grise contrôlée, dépôt sécurisé.
          </p>

          <div className="mt-7 space-y-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-3.5 text-white">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface/50 text-gold ring-1 ring-gold/25">
                  <f.Icon className="size-5" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[14px] font-bold leading-tight">{f.title}</div>
                  <div className="text-[12px] text-white/60">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2.5">
              {["#d4af37", "#b8941f", "#e8c668", "#8a6d18"].map((c, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="size-8 rounded-full ring-2 ring-[#141414]"
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="leading-tight text-white">
              <div className="text-[12.5px] font-extrabold">Plus de 12 000 utilisateurs</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                  ))}
                </span>
                <span className="text-[11px] text-white/60">nous font confiance</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
