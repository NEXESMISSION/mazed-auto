import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStats } from "@/lib/db";
import { formatNumber } from "@/lib/format";

/**
 * Guest hero — phone-shaped column, big bold headline, two CTAs, inline
 * stats strip below. Mirrors the home composition from the reference design
 * but for the not-signed-in case.
 */
export async function Hero() {
  const supabase = await createClient();
  const stats = await getPlatformStats(supabase);

  return (
    <section className="relative overflow-hidden">
      {/* Subtle gold glow behind the headline */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 h-[360px] w-[360px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,175,55,0.16), transparent 70%)",
        }}
      />

      <div className="relative px-5 pt-10 pb-8 max-w-[var(--max-w)] mx-auto">
        {/* Tiny live badge */}
        <Link
          href="/auctions"
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.2em] mb-5 hover:bg-[var(--gold-faint)]/80 transition-colors"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
          {formatNumber(stats.activeAuctions || 0)} enchères en direct
        </Link>

        {/* Headline — sized for the narrow phone column */}
        <h1 className="font-extrabold leading-[1.1] tracking-tight text-[34px]">
          Découvrir. Enchérir.
          <br />
          <span className="gradient-gold-text">Gagner.</span>
        </h1>

        {/* Subhead */}
        <p className="text-[var(--foreground-muted)] mt-4 text-sm leading-relaxed">
          La plateforme tunisienne d'enchères de confiance. Une vérification multi-couches détecte 80% des
          fraudes avant la publication.
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-2.5 mt-6">
          <Link href="/auctions">
            <Button size="lg" fullWidth>
              Parcourir les enchères
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/register?role=seller">
            <Button size="lg" variant="secondary" fullWidth>
              Commencer à vendre
            </Button>
          </Link>
        </div>

        {/* Inline stats strip */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Stat
            value={formatNumber(stats.activeAuctions || 0)}
            label="Enchères actives"
          />
          <Stat
            value={formatNumber(stats.completedDeals || 0)}
            label="Ventes réalisées"
          />
          <Stat
            value={formatNumber(stats.verifiedSellers || 0)}
            label="Vendeurs vérifiés"
          />
          <Stat value={`${stats.satisfaction || 0}★`} label="Satisfaction" />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-lg font-extrabold text-[var(--gold)] tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider mt-1.5 text-[var(--foreground-muted)]">
        {label}
      </div>
    </div>
  );
}
