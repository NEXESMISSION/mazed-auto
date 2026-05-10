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
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-6">
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {myAuctions.slice(0, 6).map((a) => (
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
