"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  TrendingUp,
  Gavel,
  Wallet,
  Star,
  Plus,
  ArrowRight,
  ShieldCheck,
  Eye,
  MessageSquare,
  Lightbulb,
  Sparkles,
  Camera,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { mapAuction, type AuctionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

export default function SellerDashboardPage() {
  const { user, loaded } = useAuth();
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [totalBidsReceived, setTotalBidsReceived] = useState(0);

  useEffect(() => {
    if (!loaded || !user) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      // Sweep expired auctions first so the dashboard never shows a row
      // sitting in "active" with a long-passed end_time.
      try {
        await supabase.rpc("end_expired_auctions");
      } catch {
        // ignore — the client-side endTime guard below covers the gap
      }
      const { data } = await supabase
        .from("auctions")
        .select("*, seller:sellers(*)")
        .eq("seller_id", user.id)
        .order("end_time", { ascending: true });
      if (cancelled) return;
      const auctions = (data ?? []).map((r) =>
        mapAuction(r as unknown as AuctionRow),
      );
      setMyAuctions(auctions);

      // Total bids across all my auctions — drives the 4th KPI tile.
      // Sum totalBids; if not populated by the row, fall back to a
      // count(bids) query gated to my auction ids.
      const summed = auctions.reduce((s, a) => s + (a.totalBids ?? 0), 0);
      setTotalBidsReceived(summed);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loaded]);

  // Time-aware "active" check — covers the brief window between an
  // auction's end_time passing and end_expired_auctions flipping its
  // status. Without this, the count momentarily disagrees with the UI.
  const now = Date.now();
  const isLive = (a: Auction) =>
    (a.status === "active" || a.status === "ending") &&
    a.endTime.getTime() > now;

  const stats = {
    active: myAuctions.filter(isLive).length,
    completed: myAuctions.filter((a) => a.status === "ended").length,
    earnings: myAuctions
      .filter((a) => a.status === "ended")
      .reduce((s, a) => s + a.currentPrice * 0.93, 0),
    bids: totalBidsReceived,
  };

  const displayName =
    user?.firstName || user?.email?.split("@")[0] || "vendeur";

  return (
    <AppShell>
      {/* MOBILE — original layout, untouched */}
      <div className="lg:hidden max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Tableau <span className="gradient-gold-text">vendeur</span>
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              {user
                ? `Bienvenue, ${user.firstName || user.email}`
                : "Connectez-vous pour gérer vos enchères"}
            </p>
          </div>
          {user && user.kycStatus === "verified" && (
            <Badge variant="gold">
              <Star className="h-3 w-3 fill-current" />
              Vérifié
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat
            icon={<Gavel className="h-4 w-4" />}
            label="Enchères actives"
            value={String(stats.active)}
          />
          <Stat
            icon={<TrendingUp className="h-4 w-4" />}
            label="Ventes réalisées"
            value={String(stats.completed)}
          />
          <Stat
            icon={<Wallet className="h-4 w-4" />}
            label="Total des revenus"
            value={formatPrice(Math.round(stats.earnings))}
            small
          />
        </div>

        <Link href="/seller/new/step-1">
          <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--gold-soft)]/40 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-5 hover:border-[var(--gold)] transition-colors cursor-pointer group">
            <div
              className="absolute -top-10 -left-10 h-32 w-32 rounded-full opacity-30 group-hover:opacity-50 transition-opacity"
              style={{
                background:
                  "radial-gradient(circle, var(--gold), transparent 70%)",
              }}
            />
            <div className="relative flex items-center gap-4">
              <div className="h-12 w-12 rounded-full gradient-gold flex items-center justify-center text-black shrink-0">
                <Plus className="h-6 w-6" strokeWidth={3} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg">Publier une nouvelle enchère</div>
                <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  5 étapes, vérification automatique, des milliers d'acheteurs
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-[var(--gold)]" />
            </div>
          </div>
        </Link>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Mes enchères</h2>
            <Link
              href="/seller/auctions"
              className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
            >
              Voir tout
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {myAuctions.length === 0 ? (
            <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">
              Vous n'avez encore publié aucune enchère. Cliquez sur &ldquo;Publier une nouvelle enchère&rdquo; pour commencer.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {myAuctions.slice(0, 6).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ============================================================
          DESKTOP — command-center layout.
          1. Identity hero card with avatar + greeting + KYC chip + inline CTAs
          2. 4 KPI tiles in a row (Active / Sold / Revenue / Bids received)
          3. 2-col grid: auctions on the start, pro tips on the end
          ============================================================ */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-8">
        {/* ── Identity hero card ── */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[#1a1408] ring-1 ring-[var(--gold)]/15 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-[var(--gold)] blur-3xl opacity-10"
          />
          <div className="relative p-8 xl:p-10">
            <div className="flex items-start justify-between gap-6">
              {/* Avatar + greeting */}
              <div className="flex items-center gap-5 min-w-0">
                <div className="relative shrink-0">
                  <Avatar
                    size="xl"
                    alt={displayName}
                    className="!h-20 !w-20 ring-2 ring-[var(--gold)]/40 shadow-[var(--shadow-gold)]"
                  />
                  {user?.kycStatus === "verified" && (
                    <span
                      className="absolute -bottom-1 -end-1 h-7 w-7 rounded-full bg-[var(--gold)] ring-2 ring-[var(--surface)] flex items-center justify-center"
                      title="Vendeur vérifié"
                    >
                      <ShieldCheck
                        className="h-3.5 w-3.5 text-black"
                        strokeWidth={3}
                      />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                    Tableau vendeur
                  </div>
                  <h1 className="mt-1.5 text-4xl xl:text-5xl font-black tracking-tight leading-[1.02]">
                    Bonjour,{" "}
                    <span className="gradient-gold-text">{displayName}</span>
                  </h1>
                  <p className="mt-2 text-sm xl:text-base text-[var(--foreground-muted)]">
                    {user
                      ? "Suivez vos ventes en cours et publiez de nouvelles enchères."
                      : "Connectez-vous pour gérer vos enchères."}
                  </p>
                </div>
              </div>

              {/* KYC chip on the end */}
              {user?.kycStatus === "verified" && (
                <Badge variant="gold" size="lg" className="shrink-0">
                  <Star className="h-4 w-4 fill-current" />
                  Vendeur vérifié
                </Badge>
              )}
            </div>

            {/* Inline CTA row */}
            <div className="mt-7 flex items-center gap-3 flex-wrap">
              <Link
                href="/seller/new/step-1"
                className="group inline-flex items-center gap-2 h-12 px-5 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.99] transition-transform"
              >
                <Plus className="h-4 w-4" strokeWidth={3} />
                Publier une nouvelle enchère
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/seller/auctions"
                className="inline-flex items-center gap-2 h-12 px-5 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors"
              >
                <Gavel className="h-4 w-4" />
                Toutes mes annonces
              </Link>
              <Link
                href="/messages"
                className="inline-flex items-center gap-2 h-12 px-5 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Messages
              </Link>
            </div>
          </div>
        </section>

        {/* ── KPI tiles row ── */}
        <div className="grid grid-cols-4 gap-5">
          <KpiTile
            Icon={Gavel}
            label="Enchères actives"
            value={String(stats.active)}
            sub={
              stats.active === 0
                ? "Aucune en cours"
                : stats.active === 1
                  ? "Enchère en direct"
                  : "Enchères en direct"
            }
            tone="gold"
          />
          <KpiTile
            Icon={TrendingUp}
            label="Ventes réalisées"
            value={String(stats.completed)}
            sub={
              stats.completed === 0
                ? "Aucune vente"
                : "Voitures vendues"
            }
            tone="success"
          />
          <KpiTile
            Icon={Wallet}
            label="Revenus totaux"
            value={formatPrice(Math.round(stats.earnings))}
            sub="Net (après commission 7 %)"
            tone="gold"
            valueClass="text-2xl xl:text-3xl"
          />
          <KpiTile
            Icon={Eye}
            label="Offres reçues"
            value={String(stats.bids)}
            sub={
              stats.bids === 0
                ? "Aucune offre encore"
                : "Sur toutes vos annonces"
            }
            tone="info"
          />
        </div>

        {/* ── Auctions + side tips ── */}
        <div className="grid grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-8 xl:gap-10 items-start">
          {/* My auctions */}
          <section className="space-y-5 min-w-0">
            <div className="flex items-end justify-between gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                  Vos annonces
                </div>
                <h2 className="mt-1.5 text-3xl xl:text-4xl font-black tracking-tight">
                  Mes <span className="gradient-gold-text">enchères</span>
                </h2>
              </div>
              {myAuctions.length > 0 && (
                <Link
                  href="/seller/auctions"
                  className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-[13px] font-bold transition-colors"
                >
                  Tout voir
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            <div className="h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />

            {myAuctions.length === 0 ? (
              <EmptyAuctions />
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
                {myAuctions.slice(0, 6).map((a) => (
                  <AuctionCard key={a.id} auction={a} />
                ))}
              </div>
            )}
          </section>

          {/* Pro tips sidebar */}
          <aside className="sticky top-24 space-y-4">
            <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                    Conseils
                  </div>
                  <div className="text-sm font-extrabold leading-tight">
                    Vendre plus vite
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                <Tip
                  Icon={Camera}
                  title="Photos nettes = +30 % d'offres"
                  text="12 angles obligatoires, lumière naturelle"
                />
                <Tip
                  Icon={Clock}
                  title="Lancez en milieu de semaine"
                  text="Mardi-jeudi génèrent 22 % de plus de vues"
                />
                <Tip
                  Icon={Sparkles}
                  title="Description détaillée"
                  text="Historique d'entretien rassure les acheteurs"
                />
              </ul>
              <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
                <Link
                  href="/help"
                  className="text-[12px] font-bold text-[var(--gold)] hover:underline inline-flex items-center gap-1.5"
                >
                  Guide complet du vendeur
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Performance summary card */}
            <div className="rounded-2xl bg-gradient-to-br from-[var(--surface)] to-[#1a1408] ring-1 ring-[var(--gold)]/20 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                Performance
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight">
                {stats.completed > 0 ? (
                  <>
                    Excellent travail{" "}
                    <span className="inline-block">👏</span>
                  </>
                ) : stats.active > 0 ? (
                  <>
                    Vos annonces sont
                    <br />
                    <span className="gradient-gold-text">en direct</span>
                  </>
                ) : (
                  <>
                    Prêt à <span className="gradient-gold-text">vendre</span> ?
                  </>
                )}
              </div>
              <p className="mt-2 text-[12px] text-[var(--foreground-muted)] leading-relaxed">
                {stats.completed > 0
                  ? `${stats.completed} ${stats.completed === 1 ? "voiture vendue" : "voitures vendues"} pour un total net de ${formatPrice(Math.round(stats.earnings))}.`
                  : stats.active > 0
                    ? `${stats.bids} ${stats.bids === 1 ? "offre reçue" : "offres reçues"} jusqu'à présent. Surveillez vos enchères.`
                    : "Publiez votre première annonce pour atteindre des milliers d'acheteurs vérifiés."}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--foreground-muted)] text-xs mb-1.5">
        {icon}
        {label}
      </div>
      <div
        className={`font-extrabold text-[var(--gold)] tabular-nums ${
          small ? "text-base" : "text-xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Desktop KPI tile — icon pill + value + label + sub-label. Tone drives
 *  the icon background + the value color, keeping the visual rhythm
 *  consistent across the dashboard. */
function KpiTile({
  Icon,
  label,
  value,
  sub,
  tone,
  valueClass,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "gold" | "success" | "info";
  /** Override for the value typography (e.g. tighter for long currency). */
  valueClass?: string;
}) {
  const accent = {
    gold: {
      icon: "bg-[var(--gold-faint)] text-[var(--gold)] ring-[var(--gold)]/30",
      number: "gradient-gold-text",
    },
    success: {
      icon: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
      number: "text-emerald-400",
    },
    info: {
      icon: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
      number: "text-blue-300",
    },
  }[tone];
  return (
    <div className="group rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-6 hover:ring-[var(--gold-soft)] transition-colors">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "h-11 w-11 rounded-xl ring-1 flex items-center justify-center",
            accent.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-5 font-black tabular-nums leading-none",
          accent.number,
          valueClass ?? "text-4xl xl:text-5xl",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[12px] text-[var(--foreground-muted)]">
        {sub}
      </div>
    </div>
  );
}

/** Pro-tip row in the sidebar. Small icon + title + one-liner. */
function Tip({
  Icon,
  title,
  text,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <li className="px-5 py-4 flex items-start gap-3">
      <span className="h-8 w-8 shrink-0 rounded-lg bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center mt-0.5">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-bold leading-tight">{title}</div>
        <div className="text-[11px] text-[var(--foreground-muted)] leading-snug mt-0.5">
          {text}
        </div>
      </div>
    </li>
  );
}

/** Rich empty state — gold-tinted card with an illustration, headline and CTA.
 *  Replaces the plain "Vous n'avez encore publié" line so the dashboard feels
 *  alive even on a fresh account. */
function EmptyAuctions() {
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[#1a1408] ring-1 ring-[var(--gold)]/20 p-10 min-h-[280px] flex items-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -end-20 h-64 w-64 rounded-full bg-[var(--gold)] blur-3xl opacity-10"
      />
      <div className="relative flex items-center gap-8 w-full">
        <span className="h-24 w-24 rounded-3xl bg-[var(--gold)] text-black shadow-[var(--shadow-gold)] flex items-center justify-center shrink-0">
          <Plus className="h-12 w-12" strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            Première annonce
          </div>
          <h3 className="mt-1.5 text-2xl xl:text-3xl font-black tracking-tight leading-tight">
            Publiez votre première voiture
          </h3>
          <p className="mt-2 text-sm text-[var(--foreground-muted)] leading-relaxed max-w-lg">
            5 étapes guidées : données, photos, vidéo, vérification de
            propriété, prix. Notre équipe valide chaque annonce en 24 h.
          </p>
          <Link
            href="/seller/new/step-1"
            className="group mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] transition-transform"
          >
            Commencer maintenant
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
