import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Sparkles } from "lucide-react";

export function CTABanner() {
  return (
    <section className="py-8 px-4">
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--gold-soft)]/40 bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)] p-6">
        {/* Decorative gold glow */}
        <div
          className="absolute -top-16 -left-16 h-56 w-56 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212, 175, 55, 0.18), transparent 70%)",
          }}
        />

        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--gold-faint)] text-[var(--gold-bright)] text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
Vous avez une voiture à vendre ?
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight leading-tight">
            <span className="gradient-gold-text">Publiez votre enchère</span> aujourd'hui
          </h2>
          <p className="text-[var(--foreground-muted)] mt-2 text-sm leading-relaxed">
            5 étapes simples, vérification automatique, des milliers d'acheteurs sérieux vous attendent.
            Commission de 7% uniquement à la vente.
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <Link href="/register?role=seller">
              <Button size="lg" fullWidth>
                Commencer maintenant
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button size="lg" variant="ghost" fullWidth>
Découvrir le fonctionnement
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
