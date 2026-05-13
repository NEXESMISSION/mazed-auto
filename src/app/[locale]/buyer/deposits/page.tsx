import { Link } from "@/i18n/navigation";
import {
  Wallet,
  ShieldCheck,
  Lock,
  HelpCircle,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusVariant: Record<
  string,
  "warning" | "success" | "danger" | "gold" | "default"
> = {
  pending: "warning",
  processing: "gold",
  completed: "success",
  failed: "danger",
};

const statusLabels: Record<string, string> = {
  pending: "Bloquée",
  processing: "En cours",
  completed: "Remboursée",
  failed: "Échec",
};

export default async function DepositsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-5">
          <Header />
          <EmptyHero
            title="Connectez-vous pour voir vos cautions"
            subtitle="Suivez chaque dépôt et son remboursement automatique."
            cta={
              <Link href="/login">
                <Button size="lg">Connexion</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const allTx = await listTransactions(supabase, {
    userId: user.id,
    limit: 100,
  });
  const deposits = allTx.filter((r) => r.type === "deposit");
  const totalHeld = deposits
    .filter((d) => d.status === "pending" || d.status === "processing")
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const refundedTotal = deposits
    .filter((d) => d.status === "completed")
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const heldCount = deposits.filter(
    (d) => d.status === "pending" || d.status === "processing",
  ).length;

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 lg:px-8 lg:py-10 space-y-5 lg:space-y-7">
        <Header />

        {/* Hero balance card — fintech-clean. Big number, status pills,
            soft gold halo. The "5% caution" is the central figure of
            this page so it gets all the visual weight. */}
        <section className="relative overflow-hidden rounded-[var(--radius-lg)] lg:rounded-[28px] bg-gradient-to-br from-[#1a1408] via-[var(--surface)] to-[var(--surface-2)] border border-[var(--gold-soft)]/40 lg:ring-1 lg:ring-[var(--gold)]/20 lg:border-0 p-6 lg:p-10">
          <div
            className="pointer-events-none absolute -top-20 -right-12 lg:-top-24 lg:-right-24 h-48 w-48 lg:h-72 lg:w-72 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,55,0.22), transparent 70%)",
            }}
          />
          <div className="relative">
            <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] lg:tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
              Total bloqué
            </div>
            <div className="text-[40px] lg:text-[64px] xl:text-[72px] font-extrabold lg:font-black gradient-gold-text tabular-nums leading-none mt-1.5 lg:mt-3">
              {formatPrice(totalHeld)}
            </div>
            <div className="mt-3 lg:mt-5 flex flex-wrap items-center gap-3 lg:gap-4 text-xs lg:text-sm">
              <span className="inline-flex items-center gap-1.5 lg:gap-2 text-[var(--foreground-muted)]">
                <Lock className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-[var(--gold)]" />
                <span className="font-semibold lg:font-bold tabular-nums">
                  {heldCount}
                </span>{" "}
                {heldCount === 1 ? "caution" : "cautions"} en cours
              </span>
              <span className="text-[var(--foreground-subtle)]">·</span>
              <span className="inline-flex items-center gap-1.5 lg:gap-2 text-[var(--foreground-muted)]">
                <ShieldCheck className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-emerald-400" />
                <span className="font-semibold lg:font-bold tabular-nums">
                  {formatPrice(refundedTotal)}
                </span>{" "}
                remboursés à ce jour
              </span>
            </div>
          </div>
        </section>

        {/* Quiet info row — what is this, why is it safe. */}
        <section className="grid grid-cols-3 gap-2.5 lg:gap-5">
          <InfoTile
            icon={<Lock className="h-4 w-4 lg:h-5 lg:w-5" />}
            title="5%"
            subtitle="Caution par enchère"
          />
          <InfoTile
            icon={<ShieldCheck className="h-4 w-4 lg:h-5 lg:w-5" />}
            title="Séquestre"
            subtitle="Compte dédié"
          />
          <InfoTile
            icon={<Calendar className="h-4 w-4 lg:h-5 lg:w-5" />}
            title="Auto"
            subtitle="Remboursée si perdue"
          />
        </section>

        {/* History */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Historique</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-bold">
              {deposits.length} {deposits.length === 1 ? "ligne" : "lignes"}
            </span>
          </div>

          {deposits.length === 0 ? (
            <EmptyHero
              title="Aucune caution pour le moment"
              subtitle="Quand vous participerez à une enchère, votre caution apparaîtra ici."
              cta={
                <Link href="/auctions">
                  <Button size="lg">
                    Parcourir les enchères
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {deposits.map((d) => (
                <div
                  key={d.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                        d.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : d.status === "failed"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-[var(--gold-faint)] text-[var(--gold)]"
                      }`}
                    >
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      {/* Label is the auction-specific descriptor we set
                          when the deposit was placed. When it's missing
                          (older admin-inserted rows, manual top-ups, etc.)
                          fall back to a generic title so users never see
                          "TX-abc123" as the only signal of what this row
                          is. The ref shows in the meta line below either
                          way for support traceability. */}
                      <div className="font-bold text-sm line-clamp-1">
                        {d.label || "Caution d'enchère"}
                      </div>
                      <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5 tabular-nums inline-flex items-center gap-1.5">
                        <span>
                          {new Date(d.created_at).toLocaleDateString("fr-TN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[var(--foreground-subtle)]">·</span>
                        <span className="font-mono text-[var(--foreground-subtle)] truncate">
                          {d.ref}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-end shrink-0 space-y-1">
                    <div className="font-extrabold tabular-nums">
                      {formatPrice(Number(d.amount))}
                    </div>
                    <Badge variant={statusVariant[d.status]} size="sm">
                      {statusLabels[d.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Help row — direct support contact, bottom of the page. */}
        <Link
          href="/help"
          className="flex items-center justify-between gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-9 w-9 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center shrink-0">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm">Une question sur une caution ?</div>
              <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                Notre équipe support répond sous 24 h.
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-[var(--foreground-muted)] group-hover:text-[var(--gold)] transition-colors shrink-0" />
        </Link>
      </div>
    </AppShell>
  );
}

function Header() {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[10px] lg:text-[11px] uppercase tracking-[0.2em] lg:tracking-[0.22em] font-bold text-[var(--gold)]">
        <Wallet className="h-3.5 w-3.5" />
        Compte séquestre
      </div>
      <h1 className="text-2xl lg:text-4xl xl:text-5xl font-extrabold lg:font-black lg:tracking-tight mt-1 lg:mt-2 lg:leading-[1.05]">
        Mes <span className="gradient-gold-text">cautions</span>
      </h1>
      <p className="hidden lg:block mt-3 text-base text-[var(--foreground-muted)] max-w-2xl">
        Toutes vos cautions, leur état actuel, et l&apos;historique des
        remboursements. Stockées sur un compte séquestre dédié et
        remboursées automatiquement.
      </p>
    </div>
  );
}

function InfoTile({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3 lg:p-5 text-center lg:text-start lg:flex lg:items-center lg:gap-4">
      <div className="mx-auto lg:mx-0 h-8 w-8 lg:h-12 lg:w-12 rounded-full lg:rounded-xl bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="lg:min-w-0">
        <div className="mt-2 lg:mt-0 text-base lg:text-2xl font-extrabold lg:font-black tabular-nums leading-tight">
          {title}
        </div>
        <div className="text-[10px] lg:text-[12px] text-[var(--foreground-muted)] mt-0.5 leading-tight">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function EmptyHero({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center space-y-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(212,175,55,0.18), transparent 70%)",
        }}
      />
      <div className="relative mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/40 flex items-center justify-center">
        <Wallet className="h-6 w-6 text-[var(--gold)]" />
      </div>
      <div className="relative space-y-1.5 max-w-sm mx-auto">
        <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          {subtitle}
        </p>
      </div>
      {cta && <div className="relative">{cta}</div>}
    </div>
  );
}
