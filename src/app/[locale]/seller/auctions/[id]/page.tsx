import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import {
  ArrowLeft,
  Eye,
  Users,
  Gavel,
  TrendingUp,
  Edit,
  X as XIcon,
  ExternalLink,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/auction/Countdown";
import { AuctionResultBanner } from "@/components/auction/AuctionResultBanner";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById, listRecentBids } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { anonBidder } from "@/lib/anon";
import type { AuctionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

const statusBadge: Record<
  AuctionStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "default" }
> = {
  scheduled: { label: "Planifiée", variant: "info" },
  active: { label: "Active", variant: "success" },
  ending: { label: "Bientôt terminé", variant: "warning" },
  ended: { label: "Terminée", variant: "default" },
  cancelled: { label: "Annulée", variant: "danger" },
  pending_seller_decision: { label: "En attente de votre décision", variant: "warning" },
  reserve_not_met: { label: "Prix de réserve non atteint", variant: "warning" },
  pending_review: { label: "En cours de modération", variant: "warning" },
  re_offered: { label: "Re-proposée (gagnant a renoncé)", variant: "warning" },
};

export default async function SellerAuctionDetailPage({ params }: Props) {
  const { id, locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect({ href: `/login?redirect=/seller/auctions/${id}`, locale });

  const auction = await getAuctionById(supabase, id);
  if (!auction) notFound();

  // Only the owning seller (or admin) may see this dashboard view.
  const role = (user.user_metadata as { role?: string } | null)?.role;
  if (auction.seller.id !== user.id && role !== "admin") {
    redirect({ href: `/auctions/${id}`, locale });
  }

  const sb = statusBadge[auction.status];
  const bids = await listRecentBids(supabase, id, 50);

  // Unique bidders count from the bid log (more accurate than the cached
  // total_participants column if a trigger lagged behind).
  const uniqueBidders = new Set(
    bids.map((b) => b.user_id).filter(Boolean) as string[],
  ).size;

  // Approximate views from a `views` count column if present; fall back to bids*3.
  const { data: viewsRow } = await supabase
    .from("auction_views")
    .select("count")
    .eq("auction_id", id)
    .maybeSingle();
  const views = (viewsRow?.count as number | undefined) ?? auction.totalBids * 3;

  const isLive = auction.status === "active" || auction.status === "ending";
  const canEdit = auction.status === "pending_review" || auction.totalBids === 0;
  const canCancel = isLive && auction.totalBids === 0;

  // Reserve progress
  const reserveProgress = auction.reservePrice
    ? Math.min(
        100,
        Math.round((auction.currentPrice / auction.reservePrice) * 100),
      )
    : null;

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 md:px-6 py-5 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/seller/auctions"
            className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Mes enchères
          </Link>
          <Link
            href={`/auctions/${id}`}
            className="inline-flex items-center gap-1 text-xs text-[var(--gold)] font-bold hover:underline"
          >
Aperçu public
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <header className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={auction.vehicle.imageUrls[0]}
            alt=""
            className="h-24 w-32 md:h-28 md:w-40 rounded-[var(--radius-md)] object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={sb.variant} size="sm">
                {sb.label}
              </Badge>
              {isLive && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
                  <Countdown endTime={auction.endTime} size="sm" withIcon={false} />
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1.5 tracking-tight">
              {auction.vehicle.make} {auction.vehicle.model} {auction.vehicle.year}
            </h1>
            <div className="text-xs text-[var(--foreground-muted)] mt-1">
              {auction.vehicle.color} · {auction.vehicle.city}
            </div>
          </div>
        </header>

        {/* Result + decision banner — when the auction is in
            `pending_seller_decision` (reserve not met but offers exist),
            this is where the seller sees the Accept / Refuse buttons.
            For other final states (won, lost, no_bids, etc.) it shows
            the contextual outcome. Hidden for live auctions. */}
        <AuctionResultBanner auction={auction} />

        {/* Stat cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Prix actuel"
            value={formatPrice(auction.currentPrice)}
            highlight
          />
          <StatCard
            icon={<Gavel className="h-4 w-4" />}
            label="Nombre d'offres"
            value={String(auction.totalBids)}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Enchérisseurs uniques"
            value={String(uniqueBidders || auction.totalParticipants)}
          />
          <StatCard
            icon={<Eye className="h-4 w-4" />}
            label="Vues"
            value={String(views)}
          />
        </section>

        {/* Reserve progress */}
        {auction.reservePrice && reserveProgress !== null && (
          <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)]">
Progression vers le prix de réserve
              </div>
              <div
                className={`text-xs font-bold ${
                  auction.reserveMet
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }`}
              >
                {auction.reserveMet ? "✓ Atteint" : `${reserveProgress}%`}
              </div>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className={`h-full transition-all ${
                  auction.reserveMet ? "bg-[var(--success)]" : "gradient-gold"
                }`}
                style={{ width: `${reserveProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--foreground-muted)] mt-1.5 tabular-nums">
              <span>{formatPrice(auction.currentPrice)}</span>
              <span>{formatPrice(auction.reservePrice)}</span>
            </div>
          </section>
        )}

        {/* Bid log */}
        <section className="space-y-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-[var(--gold)]" />
Liste des enchérisseurs
            <span className="text-xs text-[var(--foreground-muted)] font-normal">
              ({bids.length})
            </span>
          </h2>
          {bids.length === 0 ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">
Aucune offre pour le moment
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {bids.map((b, idx) => (
                <div
                  key={b.id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0
                        ? "bg-[var(--gold)] text-black"
                        : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {anonBidder(b.user_id, idx)}
                      {b.is_auto_bid && (
                        <span className="ms-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
                          AUTO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(b.placed_at).toLocaleString("fr-TN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                  <div
                    className={`font-bold tabular-nums ${
                      idx === 0 ? "text-[var(--gold)]" : ""
                    }`}
                  >
                    {formatPrice(Number(b.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {canEdit ? (
            <Link href={`/seller/new/step-1?edit=${id}`}>
              <Button variant="secondary" size="md" fullWidth>
                <Edit className="h-4 w-4" />
Modifier les données
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" size="md" fullWidth disabled>
              <Edit className="h-4 w-4" />
Modification impossible après le début de l'enchère
            </Button>
          )}
          {canCancel ? (
            <Button variant="danger" size="md" fullWidth>
              <XIcon className="h-4 w-4" />
              Annuler l'enchère
            </Button>
          ) : (
            <Button variant="secondary" size="md" fullWidth disabled>
              <XIcon className="h-4 w-4" />
{isLive ? "Annulation impossible après réception d'offres" : "Indisponible"}
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border p-4 ${
        highlight
          ? "bg-gradient-to-br from-[var(--surface)] to-[#1a1408] border-[var(--gold)]/30"
          : "bg-[var(--surface)] border-[var(--border)]"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--foreground-muted)]">
        {icon}
        {label}
      </div>
      <div
        className={`text-xl md:text-2xl font-extrabold tabular-nums mt-1.5 ${
          highlight ? "gradient-gold-text" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
