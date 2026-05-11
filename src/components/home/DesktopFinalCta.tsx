import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Gavel, Tag } from "lucide-react";

/**
 * Desktop-only closing CTA strip — twin pillars:
 *   - Sell your car  → /seller/new/step-1
 *   - Browse auctions → /auctions
 *
 * Sits just before the BottomTabBar / footer area on lg+. Mobile keeps
 * the single-column flow it has today (no twin-pillar layout).
 */
export function DesktopFinalCta() {
  return (
    <section className="hidden lg:block mt-16 mb-6">
      <div className="max-w-[var(--max-w-wide)] mx-auto px-8">
        <div className="grid grid-cols-2 gap-6">
          <Pillar
            href="/auctions"
            Icon={Gavel}
            eyebrow="Acheteurs"
            title="Trouvez votre prochaine voiture"
            text="Plus de 200 enchères vérifiées, chaque jour, partout en Tunisie."
            cta="Parcourir tout"
            tone="gold"
          />
          <Pillar
            href="/seller/new/step-1"
            Icon={Tag}
            eyebrow="Vendeurs"
            title="Vendez votre voiture en 5 étapes"
            text="Commission 7 % seulement. Votre annonce vérifiée et publiée en 24 h."
            cta="Commencer à vendre"
            tone="dark"
          />
        </div>
      </div>
    </section>
  );
}

function Pillar({
  href,
  Icon,
  eyebrow,
  title,
  text,
  cta,
  tone,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  tone: "gold" | "dark";
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-[28px] p-9 xl:p-10 ring-1 transition-all min-h-[260px] flex flex-col justify-between ${
        tone === "gold"
          ? "bg-gradient-to-br from-[#1a1409] via-[#0a0a0a] to-black ring-[var(--gold)]/30 hover:ring-[var(--gold)]"
          : "bg-[var(--surface)] ring-[var(--border)] hover:ring-[var(--gold)]"
      }`}
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full blur-3xl opacity-30 transition-opacity group-hover:opacity-50 ${
          tone === "gold" ? "bg-[var(--gold)]" : "bg-white/15"
        }`}
      />

      <div className="relative">
        <div
          className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold ${
            tone === "gold" ? "text-[var(--gold)]" : "text-[var(--foreground-muted)]"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h3 className="mt-3 text-3xl xl:text-[34px] font-black tracking-tight leading-tight max-w-md">
          {title}
        </h3>
        <p className="mt-3 text-[15px] text-[var(--foreground-muted)] leading-relaxed max-w-md">
          {text}
        </p>
      </div>

      <div className="relative mt-8">
        <span
          className={`inline-flex items-center gap-2 h-12 px-6 rounded-full font-extrabold text-sm transition-transform group-hover:scale-[1.03] active:scale-[0.99] ${
            tone === "gold"
              ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
              : "bg-white text-black"
          }`}
        >
          {cta}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
