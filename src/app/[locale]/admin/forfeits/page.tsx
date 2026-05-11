import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ForfeitActions } from "./ForfeitActions";
import { PendingDeadlinesList } from "./PendingDeadlinesList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Forfeit {
  id: string;
  auction_id: string;
  user_id: string;
  user_label: string | null;
  amount: number;
  seller_share: number;
  platform_share: number;
  reason: "payment_deadline_expired" | "voluntary";
  forfeited_at: string;
  admin_note: string | null;
  admin_user_id: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversed_reason: string | null;
}

export interface PendingDeadline {
  auction_id: string;
  make: string;
  model: string;
  year: number;
  current_price: number;
  participation_deposit: number;
  current_winner_id: string;
  winner_label: string;
  payment_deadline: string;
  status: string;
  urgency: "expired" | "soon" | "pending";
}

export default async function ForfeitsPage() {
  const supabase = await createClient();

  // Sweep auto-forfeits first so the pending list doesn't show rows
  // that the system should already have processed.
  try {
    await supabase.rpc("process_expired_payment_deadlines");
  } catch {
    // table may not yet exist on a fresh checkout; non-fatal
  }

  const [forfeitsRes, pendingRes] = await Promise.all([
    supabase
      .from("auction_forfeits")
      .select("*")
      .order("forfeited_at", { ascending: false })
      .limit(200),
    supabase
      .from("admin_pending_payment_deadlines")
      .select("*")
      .order("payment_deadline", { ascending: true })
      .limit(100),
  ]);

  const rows = (forfeitsRes.data ?? []) as Forfeit[];
  const pending = (pendingRes.data ?? []) as PendingDeadline[];
  const error = forfeitsRes.error;

  // Stats only count non-reversed forfeits.
  const live = rows.filter((f) => !f.reversed_at);
  const totals = live.reduce(
    (acc, f) => {
      acc.total += Number(f.amount);
      acc.platform += Number(f.platform_share);
      acc.seller += Number(f.seller_share);
      return acc;
    },
    { total: 0, platform: 0, seller: 0 },
  );

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">
              Cautions retenues
            </h1>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Gérez les cautions des gagnants : prolongez le délai, forcez la
              retenue, ou annulez un forfait appliqué par erreur. Toute action
              est journalisée.
            </p>
          </div>
          <Badge variant="gold">{live.length}</Badge>
        </div>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total retenu" value={formatPrice(totals.total)} />
          <Stat
            label="Part plateforme"
            value={formatPrice(totals.platform)}
            tone="gold"
          />
          <Stat
            label="Part vendeurs"
            value={formatPrice(totals.seller)}
            tone="success"
          />
        </div>

        {/* PENDING DEADLINES — manual-action queue ------------------ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg md:text-xl font-extrabold">
              Délais de paiement en cours
            </h2>
            <Badge
              variant={
                pending.some((p) => p.urgency === "expired")
                  ? "danger"
                  : pending.some((p) => p.urgency === "soon")
                    ? "warning"
                    : "default"
              }
            >
              {pending.length}
            </Badge>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            Enchères terminées dont le gagnant n&apos;a pas encore payé.
            Prolongez le délai si justifié, ou forcez la retenue de la caution
            avant l&apos;expiration automatique.
          </p>
          <PendingDeadlinesList items={pending} />
        </section>

        {/* FORFEIT HISTORY ----------------------------------------- */}
        <section className="space-y-3">
          <h2 className="text-lg md:text-xl font-extrabold">
            Historique des forfaits
          </h2>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_1fr_110px_110px_110px_140px_120px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
              <div>Utilisateur</div>
              <div>Enchère</div>
              <div>Montant</div>
              <div>Vendeur 70%</div>
              <div>Plateforme 30%</div>
              <div>Date / Motif</div>
              <div className="text-end">Actions</div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {rows.length === 0 && (
                <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
                  Aucune caution retenue.
                </div>
              )}
              {rows.map((f) => (
                <div
                  key={f.id}
                  className={`p-4 hover:bg-[var(--surface-2)] transition-colors text-sm ${
                    f.reversed_at ? "opacity-60" : ""
                  }`}
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid md:grid-cols-[1fr_1fr_110px_110px_110px_140px_120px] gap-2 items-center">
                    <div className="font-semibold truncate">
                      {f.user_label ?? f.user_id.slice(0, 8)}
                      {f.admin_note && (
                        <div className="text-[10px] text-amber-300 font-normal mt-0.5">
                          ⚙ forcée : {f.admin_note}
                        </div>
                      )}
                      {f.reversed_at && (
                        <div className="text-[10px] text-emerald-300 font-normal mt-0.5">
                          ✓ annulée : {f.reversed_reason}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-xs text-[var(--foreground-muted)] truncate">
                      {f.auction_id.slice(0, 8)}
                    </div>
                    <div className="font-bold tabular-nums">
                      {formatPrice(Number(f.amount))}
                    </div>
                    <div className="text-emerald-400 tabular-nums">
                      {formatPrice(Number(f.seller_share))}
                    </div>
                    <div className="text-[var(--gold)] tabular-nums">
                      {formatPrice(Number(f.platform_share))}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
                      {new Date(f.forfeited_at).toLocaleDateString("fr-TN")}
                      <Badge
                        size="sm"
                        variant={
                          f.reason === "voluntary" ? "warning" : "danger"
                        }
                        className="block mt-0.5"
                      >
                        {f.reason === "voluntary"
                          ? "volontaire"
                          : "délai dépassé"}
                      </Badge>
                    </div>
                    <div className="flex justify-end">
                      {!f.reversed_at && <ForfeitActions forfeitId={f.id} />}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">
                          {f.user_label ?? f.user_id.slice(0, 8)}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--foreground-muted)] truncate mt-0.5">
                          {f.auction_id.slice(0, 8)} ·{" "}
                          {new Date(f.forfeited_at).toLocaleDateString("fr-TN")}
                        </div>
                      </div>
                      <Badge
                        size="sm"
                        variant={
                          f.reason === "voluntary" ? "warning" : "danger"
                        }
                      >
                        {f.reason === "voluntary"
                          ? "volontaire"
                          : "délai dépassé"}
                      </Badge>
                    </div>
                    {(f.admin_note || f.reversed_at) && (
                      <div className="text-[11px] space-y-0.5">
                        {f.admin_note && (
                          <div className="text-amber-300">
                            ⚙ forcée : {f.admin_note}
                          </div>
                        )}
                        {f.reversed_at && (
                          <div className="text-emerald-300">
                            ✓ annulée : {f.reversed_reason}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <MobileCell label="Montant">
                        <span className="font-bold tabular-nums">
                          {formatPrice(Number(f.amount))}
                        </span>
                      </MobileCell>
                      <MobileCell label="Vendeur 70%">
                        <span className="text-emerald-400 tabular-nums font-semibold">
                          {formatPrice(Number(f.seller_share))}
                        </span>
                      </MobileCell>
                      <MobileCell label="Plateforme 30%">
                        <span className="text-[var(--gold)] tabular-nums font-semibold">
                          {formatPrice(Number(f.platform_share))}
                        </span>
                      </MobileCell>
                    </div>
                    {!f.reversed_at && (
                      <div className="flex justify-end">
                        <ForfeitActions forfeitId={f.id} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function MobileCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gold" | "success";
}) {
  const c =
    tone === "gold"
      ? "text-[var(--gold)]"
      : tone === "success"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
