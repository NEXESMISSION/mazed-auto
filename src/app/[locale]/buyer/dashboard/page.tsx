import { Link } from "@/i18n/navigation";
import { Gavel, Heart, Trophy, Wallet, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BuyerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Recommended auctions are public — fetch always.
  const recommended = await listAuctions(supabase, {
    status: ["active", "ending"],
    limit: 6,
  });

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
          <h1 className="text-2xl font-extrabold">
            Tableau <span className="gradient-gold-text">acheteur</span>
          </h1>
          <div className="text-center py-12 space-y-3">
            <div className="font-bold">Connectez-vous pour voir votre tableau de bord</div>
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const [bids, watch, wins, deposits] = await Promise.all([
    supabase
      .from("bids")
      .select("auction_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("watchlist")
      .select("auction_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    // Wins = completed final_payments by this user. PLAN §21 — once final
    // payment lands, the user has won and bought the car.
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "final_payment")
      .eq("status", "completed"),
    // Deposits currently held (pending or processing). Refunded deposits are
    // marked completed with direction=out elsewhere.
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "deposit")
      .in("status", ["pending", "processing"]),
  ]);

  const counts = {
    bids: bids.count ?? 0,
    watchlist: watch.count ?? 0,
    wins: wins.count ?? 0,
    deposits: deposits.count ?? 0,
  };

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold">
            Tableau <span className="gradient-gold-text">acheteur</span>
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
Suivez vos enchères et vos prochaines opportunités
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatLink
            href="/buyer/bids"
            icon={<Gavel className="h-4 w-4" />}
            label="Mes enchères"
            value={String(counts.bids)}
            color="text-[var(--gold)]"
          />
          <StatLink
            href="/buyer/bids"
            icon={<Trophy className="h-4 w-4" />}
            label="Gagnées"
            value={String(counts.wins)}
            color="text-[var(--success)]"
          />
          <StatLink
            href="/buyer/bids?tab=watchlist"
            icon={<Heart className="h-4 w-4" />}
            label="Favoris"
            value={String(counts.watchlist)}
            color="text-pink-400"
          />
          <StatLink
            href="/buyer/deposits"
            icon={<Wallet className="h-4 w-4" />}
            label="Cautions"
            value={String(counts.deposits)}
            color="text-blue-400"
          />
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Suggestions pour vous</h2>
            <Link
              href="/auctions"
              className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
            >
Parcourir toutes les enchères
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recommended.length === 0 ? (
            <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">
              Aucune enchère active pour le moment. Exécutez seed.sql dans Supabase.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {recommended.slice(0, 6).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatLink({
  href,
  icon,
  label,
  value,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3 hover:border-[var(--gold)] transition-colors"
    >
      <div className="flex items-center gap-1.5 text-[var(--foreground-muted)] text-xs mb-1.5">
        {icon}
        {label}
      </div>
      <div className={`font-extrabold text-2xl tabular-nums ${color}`}>
        {value}
      </div>
    </Link>
  );
}
