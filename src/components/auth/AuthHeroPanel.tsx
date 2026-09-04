import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, Eye, Zap, Sparkles } from "lucide-react";

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
  { Icon: ShieldCheck, title: "Annonces vérifiées", sub: "Relues avant publication" },
  { Icon: Eye, title: "Prix affiché", sub: "Ni enchère, ni attente" },
  { Icon: Zap, title: "Contact direct", sub: "Vous appelez le vendeur" },
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
            Annonces vérifiées · Tunisie
          </div>
          <h2 className="mt-3 text-balance text-[34px] font-extrabold leading-[1.1] tracking-tight text-white">
            Voitures et <span className="gradient-gold-text">pièces de rechange</span>.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/70">
            Achetez et vendez en toute confiance — chaque annonce est relue
            avant sa publication, et vous traitez directement avec le vendeur.
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

          {/* No invented social proof. This said "Plus de 12 000 utilisateurs
              nous font confiance" above five gold stars, on a site with 22
              accounts — a number nobody counted, next to reviews nobody left.
              It is the first thing a new seller reads, and it is the kind of
              claim that costs more when someone checks it than it ever earned.
              What IS true: every annonce is read by a person before it goes
              live. Say that instead. */}
          <div className="mt-8 flex items-center gap-3 rounded-2xl bg-surface/40 p-3.5 ring-1 ring-gold/15">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--gold)]/15 text-gold">
              <ShieldCheck className="size-4.5" strokeWidth={2.2} />
            </span>
            <div className="leading-tight text-white">
              <div className="text-[12.5px] font-extrabold">Chaque annonce est vérifiée</div>
              <div className="mt-0.5 text-[11px] text-white/60">
                Relue par notre équipe avant publication
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
