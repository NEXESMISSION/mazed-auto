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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { mapAuction, type AuctionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

export default function SellerDashboardPage() {
  const { user, loaded } = useAuth();
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);

  useEffect(() => {
    if (!loaded || !user) return;
    const supabase = createClient();
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
      setMyAuctions(
        (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow)),
      );
    })();
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
  };

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

      {/* DESKTOP — purpose-built. Big publish banner up top, large stats,
          generous card grid. */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-10">
        {/* Hero row */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              Tableau vendeur
            </div>
            <h1 className="mt-2 text-5xl font-black tracking-tight leading-[1.05]">
              {user
                ? `Bonjour, `
                : "Tableau "}
              <span className="gradient-gold-text">
                {user ? user.firstName || user.email?.split("@")[0] : "vendeur"}
              </span>
            </h1>
            <p className="mt-3 text-base text-[var(--foreground-muted)]">
              {user
                ? "Suivez vos ventes en cours et publiez de nouvelles enchères."
                : "Connectez-vous pour gérer vos enchères."}
            </p>
          </div>
          {user && user.kycStatus === "verified" && (
            <Badge variant="gold" size="lg">
              <Star className="h-4 w-4 fill-current" />
              Vendeur vérifié
            </Badge>
          )}
        </div>

        {/* Big publish banner — wide and visually anchoring */}
        <Link href="/seller/new/step-1">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--gold-soft)]/40 bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)] p-8 hover:border-[var(--gold)] transition-all cursor-pointer group">
            <div
              className="absolute -top-20 -left-20 h-64 w-64 rounded-full opacity-30 group-hover:opacity-50 transition-opacity"
              style={{
                background:
                  "radial-gradient(circle, var(--gold), transparent 70%)",
              }}
            />
            <div
              className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-20 group-hover:opacity-40 transition-opacity"
              style={{
                background:
                  "radial-gradient(circle, var(--gold), transparent 70%)",
              }}
            />
            <div className="relative flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl gradient-gold flex items-center justify-center text-black shrink-0 shadow-[var(--shadow-gold)]">
                <Plus className="h-8 w-8" strokeWidth={3} />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-2xl tracking-tight">
                  Publier une nouvelle enchère
                </div>
                <div className="text-sm text-[var(--foreground-muted)] mt-1">
                  5 étapes guidées · vérification automatique · des milliers
                  d&apos;acheteurs vérifiés
                </div>
              </div>
              <ArrowRight className="h-6 w-6 text-[var(--gold)] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        {/* Big stat tiles */}
        <div className="grid grid-cols-3 gap-5">
          <BigStat
            icon={<Gavel className="h-6 w-6" />}
            label="Enchères actives"
            value={String(stats.active)}
            tone="gold"
          />
          <BigStat
            icon={<TrendingUp className="h-6 w-6" />}
            label="Ventes réalisées"
            value={String(stats.completed)}
            tone="success"
          />
          <BigStat
            icon={<Wallet className="h-6 w-6" />}
            label="Total des revenus"
            value={formatPrice(Math.round(stats.earnings))}
            tone="gold"
            wide
          />
        </div>

        {/* Auctions */}
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                Vos annonces
              </div>
              <h2 className="mt-2 text-3xl font-extrabold">Mes enchères</h2>
            </div>
            <Link
              href="/seller/auctions"
              className="text-sm text-[var(--gold)] hover:underline inline-flex items-center gap-1.5"
            >
              Tout voir
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {myAuctions.length === 0 ? (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-base text-[var(--foreground-muted)]">
              Vous n&apos;avez encore publié aucune enchère. Cliquez sur le
              bandeau ci-dessus pour commencer.
            </div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-5">
              {myAuctions.slice(0, 8).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </section>
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

/** Desktop-only big stat. Wide variant spans tighter on long currency values. */
function BigStat({
  icon,
  label,
  value,
  tone,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "gold" | "success";
  wide?: boolean;
}) {
  const accent = {
    gold: {
      icon: "bg-[var(--gold-faint)] text-[var(--gold)] border-[var(--gold-soft)]",
      number: "gradient-gold-text",
    },
    success: {
      icon: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      number: "text-emerald-400",
    },
  }[tone];
  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 hover:border-[var(--gold-soft)] transition-colors">
      <div
        className={`h-12 w-12 rounded-xl border flex items-center justify-center mb-5 ${accent.icon}`}
      >
        {icon}
      </div>
      <div
        className={`font-black tabular-nums leading-none ${accent.number} ${
          wide ? "text-3xl" : "text-5xl"
        }`}
      >
        {value}
      </div>
      <div className="mt-3 text-sm font-semibold text-[var(--foreground-muted)]">
        {label}
      </div>
    </div>
  );
}
