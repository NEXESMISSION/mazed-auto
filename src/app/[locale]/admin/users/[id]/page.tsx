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
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getSellerById, listAuctionsBySeller } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { AdminUserActions } from "./AdminUserActions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const seller = await getSellerById(supabase, id);
  if (!seller) notFound();

  const auctions = await listAuctionsBySeller(supabase, seller.id);
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
            <AdminUserActions />
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
                        src={a.vehicle.imageUrls[0]}
                        alt=""
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
