import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Every auction status, grouped into filter tabs. "all" skips the
// filter. The user explicitly asked to be able to find an auction
// AFTER it's been approved — the moderation queue only ever shows
// pending_review, so this page is the full archive.
const STATUS_TABS = [
  { value: "all", label: "Toutes" },
  { value: "pending_review", label: "À modérer" },
  { value: "active", label: "Actives" },
  { value: "ending", label: "Se terminent" },
  { value: "pending_seller_decision", label: "Décision vendeur" },
  { value: "ended", label: "Terminées" },
  { value: "reserve_not_met", label: "Réserve non atteinte" },
  { value: "cancelled", label: "Annulées" },
] as const;
type StatusTab = (typeof STATUS_TABS)[number]["value"];

/** Map a status to a Badge tone so the list scans fast. */
function statusTone(
  status: string,
): "success" | "warning" | "danger" | "gold" | "default" {
  if (status === "active" || status === "ending") return "success";
  if (status === "pending_review" || status === "pending_seller_decision")
    return "warning";
  if (status === "cancelled" || status === "reserve_not_met") return "danger";
  if (status === "ended") return "default";
  return "default";
}

export default async function AdminAllAuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const supabase = await createClient();

  const status: StatusTab = STATUS_TABS.some((s) => s.value === statusParam)
    ? (statusParam as StatusTab)
    : "all";

  // No status filter for "all" — listAuctions returns everything.
  // Cap at 500 so a huge marketplace doesn't blow the page; the
  // status tabs let an admin narrow down before that ever bites.
  const auctions: Auction[] = await listAuctions(supabase, {
    status: status === "all" ? undefined : [status],
    limit: 500,
  });

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Toutes les enchères
          </h1>
          <Badge variant="default">{auctions.length}</Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">
          Toutes les enchères, quel que soit leur statut — y compris celles
          déjà approuvées, terminées ou annulées. Cliquez sur une ligne pour
          voir le détail complet (photos, vidéo, carte grise, offres).
        </p>

        {/* Status filter tabs — server-rendered links, shareable + survive
            refresh. */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <Link
                key={tab.value}
                href={
                  tab.value === "all"
                    ? "/admin/auctions"
                    : `/admin/auctions?status=${tab.value}`
                }
                className={`px-3 h-8 inline-flex items-center rounded-full text-xs font-bold border transition-colors ${
                  active
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "bg-[var(--surface)] text-[var(--foreground-muted)] border-[var(--border)] hover:border-[var(--gold-soft)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {auctions.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            Aucune enchère dans cette vue.
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            {auctions.map((a) => (
              <Link
                key={a.id}
                href={`/admin/auctions/${a.id}`}
                className="flex items-center gap-3 p-3 hover:bg-[var(--surface-2)] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb(a.vehicle.imageUrls[0], { width: 160, quality: 60 })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-14 w-20 rounded-[var(--radius-sm)] object-cover shrink-0 bg-black"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate">
                      {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--foreground-subtle)] shrink-0">
                      {auctionCode(a.id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={statusTone(a.status)} size="sm">
                      {a.status}
                    </Badge>
                    <span className="text-xs text-[var(--foreground-muted)] tabular-nums">
                      {formatPrice(a.currentPrice)}
                    </span>
                    <span className="text-xs text-[var(--foreground-subtle)]">
                      · {a.totalBids} offre{a.totalBids === 1 ? "" : "s"}
                    </span>
                    <span className="hidden sm:inline text-xs text-[var(--foreground-subtle)] truncate">
                      · {a.seller.displayName}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
