import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  Star,
  MapPin,
  Calendar,
  Gavel,
  Mail,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Ban,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import {
  getSellerById,
  listAuctionsBySeller,
  listUserActivity,
} from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { AdminUserActions } from "./AdminUserActions";
import { ActivityLog } from "./ActivityLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Try the seller view first (rich profile fields). If the user is a
  // buyer with no sellers row, fall back to the admin RPC which reads
  // straight from auth.users.
  const sellerRow = await getSellerById(supabase, id);
  let seller = sellerRow;
  if (!seller) {
    const { data: u } = await supabase
      .rpc("admin_get_user", { p_user_id: id })
      .maybeSingle<{
        id: string;
        email: string | null;
        display_name: string | null;
        username: string | null;
        kyc_status: string;
        trust_score: number;
        city: string | null;
        is_pro: boolean;
        is_active: boolean;
        verified_kyc: boolean;
        verified_ownership: boolean;
        account_age_months: number;
        successful_deals: number;
        rating_average: number;
        rating_count: number;
      }>();
    if (!u) notFound();
    // Synthesize the minimal Seller-shaped object the page expects.
    seller = {
      id: u.id,
      username: u.username ?? u.id.slice(0, 8),
      displayName:
        u.display_name ?? u.email?.split("@")[0] ?? "(sans nom)",
      avatarUrl: undefined,
      trustScore: u.trust_score,
      trustLevel:
        u.trust_score >= 156
          ? "very_trusted"
          : u.trust_score >= 96
            ? "trusted"
            : "new",
      verifiedKyc: u.verified_kyc,
      verifiedOwnership: u.verified_ownership,
      successfulDeals: u.successful_deals,
      ratingAverage: u.rating_average,
      ratingCount: u.rating_count,
      accountAgeMonths: u.account_age_months,
      city: u.city ?? "—",
      isPro: u.is_pro,
      isActive: u.is_active,
    };
  }

  const [auctions, activity, warnings, bans] = await Promise.all([
    listAuctionsBySeller(supabase, seller.id),
    listUserActivity(supabase, seller.id, 50),
    supabase
      .from("user_warnings")
      .select("id, severity, body, issued_at, dismissed_at")
      .eq("user_id", seller.id)
      .order("issued_at", { ascending: false })
      .limit(20)
      .then((r) => r.data ?? []),
    supabase
      .from("user_bans")
      .select(
        "id, scope, reason, banned_at, banned_until, lifted_at, lift_reason",
      )
      .eq("user_id", seller.id)
      .order("banned_at", { ascending: false })
      .limit(10)
      .then((r) => r.data ?? []),
  ]);
  const totalSales = auctions
    .filter((a) => a.status === "ended")
    .reduce((s, a) => s + a.currentPrice, 0);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux utilisateurs
        </Link>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
          <div className="flex flex-col md:flex-row items-start gap-5">
            <Avatar size="xl" alt={seller.displayName} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold">{seller.displayName}</h1>
                {!seller.isActive && (
                  <Badge variant="danger" size="sm">
                    <Ban className="h-3 w-3" />
                    Désactivé
                  </Badge>
                )}
                {seller.verifiedKyc && (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="h-3 w-3" />
                    KYC Vérifié
                  </Badge>
                )}
                {seller.isPro && (
                  <Badge variant="goldFilled" size="sm">
                    Pro
                  </Badge>
                )}
              </div>
              <div className="text-sm text-[var(--foreground-muted)]">
                @{seller.username}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-[var(--foreground-muted)] pt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {seller.city}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {seller.accountAgeMonths} mois
                </span>
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-[var(--gold)]" />
                  {seller.ratingAverage.toFixed(1)} ({seller.ratingCount} évaluations)
                </span>
              </div>
            </div>
            <AdminUserActions
              userId={seller.id}
              initialActive={seller.isActive}
              currentTrust={seller.trustScore}
              isPro={seller.isPro}
              ownershipVerified={seller.verifiedOwnership}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Trust Score"
            value={String(seller.trustScore)}
            tone="gold"
          />
          <Stat
            icon={<Gavel className="h-4 w-4" />}
            label="Enchères"
            value={String(auctions.length)}
          />
          <Stat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Ventes réalisées"
            value={String(seller.successfulDeals)}
            tone="success"
          />
          <Stat
            icon={<Receipt className="h-4 w-4" />}
            label="Total des ventes"
            value={formatPrice(totalSales)}
          />
        </div>

        <Section title="Informations de contact">
          <div className="grid md:grid-cols-2 gap-3">
            <InfoRow
              icon={<Mail className="h-4 w-4" />}
              label="E-mail"
              value="—"
            />
            <InfoRow
              icon={<Phone className="h-4 w-4" />}
              label="Téléphone"
              value="—"
            />
          </div>
        </Section>

        <Section title="Statut de vérification">
          <div className="grid md:grid-cols-2 gap-3">
            <KycRow label="Identité vérifiée (KYC)" ok={seller.verifiedKyc} />
            <KycRow label="Propriété vérifiée" ok={seller.verifiedOwnership} />
          </div>
        </Section>

        {warnings.length > 0 && (
          <Section title={`Avertissements (${warnings.length})`}>
            <div className="space-y-2">
              {warnings.map((w) => (
                <div
                  key={w.id}
                  className={`rounded-[var(--radius)] border p-3 text-sm ${
                    w.severity === "severe"
                      ? "bg-red-500/10 border-red-500/30"
                      : w.severity === "warning"
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-[var(--surface-2)] border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                      {w.severity}
                    </span>
                    <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
                      {new Date(w.issued_at).toLocaleDateString("fr-TN")}
                    </span>
                  </div>
                  <div>{w.body}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {bans.length > 0 && (
          <Section title={`Suspensions (${bans.length})`}>
            <div className="space-y-2">
              {bans.map((b) => {
                const active =
                  !b.lifted_at &&
                  (!b.banned_until || new Date(b.banned_until) > new Date());
                return (
                  <div
                    key={b.id}
                    className={`rounded-[var(--radius)] border p-3 text-sm ${
                      active
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-[var(--surface-2)] border-[var(--border)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-[0.18em] font-bold">
                        {b.scope}
                      </span>
                      <span className="text-[10px] text-[var(--foreground-muted)]">
                        {new Date(b.banned_at).toLocaleDateString("fr-TN")}
                        {b.banned_until
                          ? ` → ${new Date(b.banned_until).toLocaleDateString("fr-TN")}`
                          : " · permanent"}
                      </span>
                      {b.lifted_at && (
                        <Badge size="sm" variant="success">
                          levée
                        </Badge>
                      )}
                    </div>
                    <div>{b.reason}</div>
                    {b.lift_reason && (
                      <div className="text-xs text-[var(--foreground-muted)] mt-1">
                        Levée : {b.lift_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={`Historique d'activité (${activity.length})`}>
          <ActivityLog entries={activity} />
        </Section>

        <Section title={`Enchères de cet utilisateur (${auctions.length})`}>
          {auctions.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-4 text-center">
              Aucune enchère
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {auctions.map((a) => (
                <Link
                  key={a.id}
                  href={`/auctions/${a.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-[var(--surface-2)] -mx-4 px-4 transition-colors"
                >
                  <div className="h-12 w-16 rounded bg-[var(--surface-2)] overflow-hidden shrink-0">
                    {a.vehicle.imageUrls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb(a.vehicle.imageUrls[0], { width: 140, quality: 55 })}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm line-clamp-1">
                      {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {formatPrice(a.currentPrice)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      a.status === "active"
                        ? "success"
                        : a.status === "ended"
                          ? "default"
                          : "warning"
                    }
                    size="sm"
                  >
                    {a.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
      <h2 className="text-base font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "gold" | "success";
}) {
  const valueColor =
    tone === "gold"
      ? "text-[var(--gold)]"
      : tone === "success"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)]">
      <div className="text-[var(--foreground-muted)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[var(--foreground-muted)]">{label}</div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

function KycRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)]">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
        }`}
      >
        {ok ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{label}</div>
      </div>
    </div>
  );
}
