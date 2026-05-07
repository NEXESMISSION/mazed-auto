import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Star,
  MapPin,
  Calendar,
  ShieldCheck,
  FileCheck,
  Award,
  ArrowRight,
  ArrowLeft,
  Flag,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { MessageSellerButton } from "@/components/auction/MessageSellerButton";
import { createClient } from "@/lib/supabase/server";
import {
  getSellerByUsername,
  listAuctionsBySeller,
  listSellerRatings,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ username: string }>;
}

function ageString(months: number) {
  if (months < 12) return `Il y a ${months} mois`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `Il y a ${y} ${y === 1 ? "an" : "ans"}`;
  return `Il y a ${y} ${y === 1 ? "an" : "ans"} et ${m} mois`;
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();
  const seller = await getSellerByUsername(supabase, username);
  if (!seller) notFound();

  const [auctions, ratingRows] = await Promise.all([
    listAuctionsBySeller(supabase, seller.id),
    listSellerRatings(supabase, seller.id, 10),
  ]);
  const ratings = ratingRows.map((r) => ({
    buyer: r.buyer_label,
    rating: r.rating,
    comment: r.comment ?? "",
    date: r.created_at.slice(0, 10),
  }));

  const liveAuctions = auctions.filter(
    (a) => a.status === "active" || a.status === "ending",
  );
  const successRate =
    seller.successfulDeals > 0
      ? Math.round(
          (seller.successfulDeals /
            Math.max(1, seller.successfulDeals + Math.max(0, seller.ratingCount - seller.successfulDeals))) *
            100,
        )
      : 0;


  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 md:px-6 pt-4 pb-10">
        <Link
          href="/auctions"
          className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Enchères
        </Link>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-10">
          <div className="space-y-8 min-w-0">
            {/* Header */}
            <header className="flex items-start gap-5">
              <Avatar size="xl" alt={seller.displayName} src={seller.avatarUrl} />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold tracking-tight leading-tight">
                    {seller.displayName}
                  </h1>
                  {seller.isPro && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold uppercase tracking-wider">
                      <Award className="h-3 w-3" />
                      Pro
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--foreground-muted)]">
                  @{seller.username}
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
                    <span className="font-bold text-foreground">
                      {seller.ratingAverage.toFixed(1)}
                    </span>
                    <span>({seller.ratingCount})</span>
                  </span>
                  <span className="text-[var(--border-strong)]">·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {seller.city}
                  </span>
                  <span className="text-[var(--border-strong)]">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {ageString(seller.accountAgeMonths)}
                  </span>
                </div>
              </div>
            </header>

            {/* Verification chips */}
            <div className="flex flex-wrap gap-1.5">
              {seller.verifiedKyc && (
                <Chip
                  icon={<ShieldCheck className="h-3 w-3" />}
                  label="Identité vérifiée"
                />
              )}
              {seller.verifiedOwnership && (
                <Chip
                  icon={<FileCheck className="h-3 w-3" />}
                  label="Propriété vérifiée"
                />
              )}
              {seller.isPro && (
                <Chip
                  icon={<Award className="h-3 w-3" />}
                  label="Vendeur Pro"
                />
              )}
              {seller.successfulDeals > 0 && (
                <Chip label={`${seller.successfulDeals} vente réussie`} muted />
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-2">
              <MessageSellerButton sellerId={seller.id} fullWidth />
              <Button size="md" variant="ghost" aria-label="Signaler">
                <Flag className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile-only stats bar */}
            <div className="lg:hidden grid grid-cols-3 gap-2">
              <StatTile label="ventes" value={String(seller.successfulDeals)} />
              <StatTile
                label="Évaluation"
                value={
                  seller.ratingAverage > 0
                    ? seller.ratingAverage.toFixed(1)
                    : "—"
                }
              />
              <StatTile label="Succès" value={`${successRate}%`} />
            </div>

            {/* Active auctions */}
            <Section
              title={`Enchères actives (${liveAuctions.length})`}
              link={
                liveAuctions.length > 6
                  ? { href: `/auctions`, label: "Toutes les enchères" }
                  : undefined
              }
            >
              {liveAuctions.length === 0 ? (
                <div className="text-sm text-[var(--foreground-muted)] py-3">
                  Aucune enchère active actuellement
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {liveAuctions.slice(0, 6).map((a) => (
                    <AuctionCard key={a.id} auction={a} />
                  ))}
                </div>
              )}
            </Section>

            {/* Reviews */}
            <Section title={`Évaluations (${seller.ratingCount})`}>
              {ratings.length === 0 ? (
                <div className="text-sm text-[var(--foreground-muted)] py-3">
                  Aucune évaluation pour le moment
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {ratings.map((r, i) => (
                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm">{r.buyer}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[...Array(5)].map((_, idx) => (
                              <Star
                                key={idx}
                                className={`h-3 w-3 ${
                                  idx < r.rating
                                    ? "fill-[var(--gold)] text-[var(--gold)]"
                                    : "text-[var(--border-strong)]"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-[var(--foreground-subtle)]">
                            {r.date}
                          </span>
                        </div>
                      </div>
                      {r.comment && (
                        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
                          &ldquo;{r.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(var(--topbar-h)+24px)] space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Enchères actives"
                  value={String(liveAuctions.length)}
                />
                <StatTile
                  label="ventes réalisées"
                  value={String(seller.successfulDeals)}
                />
                <StatTile
                  label="Évaluation"
                  value={
                    seller.ratingAverage > 0
                      ? seller.ratingAverage.toFixed(1)
                      : "—"
                  }
                />
                <StatTile label="Taux de succès" value={`${successRate}%`} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)]">
          {title}
        </h2>
        {link && (
          <Link
            href={link.href}
            className="text-[10px] text-[var(--gold)] hover:underline inline-flex items-center gap-1"
          >
            {link.label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Chip({
  icon,
  label,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
        muted
          ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)]"
          : "bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[var(--gold)]"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-xl font-extrabold tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-bold mt-1.5">
        {label}
      </div>
    </div>
  );
}
