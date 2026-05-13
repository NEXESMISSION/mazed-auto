import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import {
  ClockAlert,
  CheckCircle2,
  Building2,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";

interface SP {
  searchParams: Promise<{
    tx?: string;
    amount?: string;
    method?: string;
    auction?: string;
  }>;
}

export const dynamic = "force-dynamic";

/**
 * Confirmation page after a manual payment submission. The transaction
 * is sitting at status='pending_verification'; an admin will review
 * the receipt and approve or reject within 24h. The user gets an
 * in-app notification when the decision lands.
 */
export default async function PaymentPendingPage({ searchParams }: SP) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PendingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PendingContent({ searchParams }: SP) {
  const sp = await searchParams;
  const amountNum = Number(sp.amount ?? 0);
  const amount = Number.isFinite(amountNum) ? amountNum : 0;
  const method = sp.method === "d17" ? "d17" : "bank_transfer";
  const Icon = method === "d17" ? Smartphone : Building2;
  const methodLabel =
    method === "d17" ? "D17 — Poste Tunisienne" : "Virement bancaire";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-md lg:max-w-[var(--max-w-content)] mx-auto w-full px-4 lg:px-8 py-8 lg:py-16">
        {/* Hero — gold icon + headline */}
        <section className="text-center space-y-4">
          <div className="mx-auto h-20 w-20 rounded-full bg-[var(--gold-faint)] ring-2 ring-[var(--gold)]/40 flex items-center justify-center shadow-[var(--shadow-gold)]">
            <ClockAlert className="h-9 w-9 text-[var(--gold)]" strokeWidth={2.2} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
              <CheckCircle2 className="h-3 w-3" />
              Reçu enregistré
            </div>
            <h1 className="mt-2 text-2xl lg:text-3xl font-black tracking-tight">
              Paiement en cours de vérification
            </h1>
            <p className="mt-3 text-sm lg:text-base text-[var(--foreground-muted)] leading-relaxed max-w-md mx-auto">
              Notre équipe vérifie votre reçu et valide votre paiement
              généralement sous 24 heures. Vous serez notifié dès que c&apos;est
              fait.
            </p>
          </div>
        </section>

        {/* Receipt summary */}
        <section className="mt-8 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
          <Row label="Montant" value={formatPrice(amount)} mono />
          <Row label="Méthode" value={methodLabel} icon={<Icon className="h-4 w-4" />} />
          {sp.tx && <Row label="Référence" value={String(sp.tx).slice(0, 8) + "…"} mono />}
          <Row label="Statut" value="En attente de vérification" tone="amber" />
        </section>

        {/* Timeline */}
        <section className="mt-6 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
            Prochaines étapes
          </div>
          <Step
            done
            title="Reçu soumis"
            sub="Votre image est arrivée"
          />
          <Step
            current
            title="Vérification administrative"
            sub="Notre équipe contrôle le reçu (sous 24h)"
          />
          <Step
            title="Confirmation"
            sub="Vous recevez une notification dans l'app"
          />
        </section>

        {/* CTAs */}
        <div className="mt-6 space-y-3">
          {sp.auction && (
            <Link href={`/auctions/${sp.auction}`} className="block">
              <Button size="lg" fullWidth>
                Retour à l&apos;enchère
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link href="/transactions" className="block">
            <Button size="lg" variant="ghost" fullWidth>
              Voir mes transactions
            </Button>
          </Link>
          <Link href="/" className="block">
            <Button size="lg" variant="ghost" fullWidth>
              Accueil
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-[var(--foreground-muted)] text-center mt-6 leading-snug">
          Vous rencontrez un problème ?{" "}
          <Link href="/help" className="text-[var(--gold)] hover:underline">
            Contacter le support
          </Link>
        </p>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div
        className={`flex items-center gap-1.5 text-sm font-bold ${
          mono ? "font-mono tabular-nums" : ""
        } ${tone === "amber" ? "text-amber-300" : "text-foreground"}`}
      >
        {icon}
        {value}
      </div>
    </div>
  );
}

function Step({
  done,
  current,
  title,
  sub,
}: {
  done?: boolean;
  current?: boolean;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ring-1 ${
          done
            ? "bg-emerald-500 text-white ring-emerald-500"
            : current
              ? "bg-[var(--gold)] text-black ring-[var(--gold)] shadow-[var(--shadow-gold)]"
              : "bg-[var(--surface-2)] text-[var(--foreground-muted)] ring-[var(--border)]"
        }`}
      >
        {done ? (
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.6} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0">
        <div
          className={`text-sm font-bold leading-tight ${
            current ? "text-foreground" : done ? "text-foreground/80" : "text-[var(--foreground-muted)]"
          }`}
        >
          {title}
        </div>
        <div className="text-[12px] text-[var(--foreground-muted)] mt-0.5 leading-snug">
          {sub}
        </div>
      </div>
    </div>
  );
}
