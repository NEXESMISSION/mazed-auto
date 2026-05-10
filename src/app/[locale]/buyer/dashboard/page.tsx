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
        <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-5">
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
      {/* MOBILE — original layout, untouched */}
      <div className="lg:hidden max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold">
            Tableau <span className="gradient-gold-text">acheteur</span>
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Suivez vos enchères et vos prochaines opportunités
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
              {recommended.slice(0, 6).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* DESKTOP — purpose-built. Bigger hero, much larger stat tiles,
          bigger card grid, hover states everywhere. */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-10">
        {/* Hero row */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              Tableau acheteur
            </div>
            <h1 className="mt-2 text-5xl font-black tracking-tight leading-[1.05]">
              Bonjour,{" "}
              <span className="gradient-gold-text">
                {(user.user_metadata?.firstName as string) ||
                  user.email?.split("@")[0]}
              </span>
            </h1>
            <p className="mt-3 text-base text-[var(--foreground-muted)] max-w-md">
              Suivez vos enchères et trouvez votre prochaine voiture.
            </p>
          </div>
          <Link
            href="/auctions"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.99] transition-transform"
          >
            Parcourir
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Hero stat tiles — much bigger numbers, generous padding, hover */}
        <div className="grid grid-cols-4 gap-5">
          <BigStatLink
            href="/buyer/bids"
            icon={<Gavel className="h-6 w-6" />}
            label="Mes enchères"
            value={counts.bids}
            tone="gold"
          />
          <BigStatLink
            href="/buyer/bids?tab=won"
            icon={<Trophy className="h-6 w-6" />}
            label="Gagnées"
            value={counts.wins}
            tone="success"
          />
          <BigStatLink
            href="/buyer/bids?tab=watchlist"
            icon={<Heart className="h-6 w-6" />}
            label="Favoris"
            value={counts.watchlist}
            tone="pink"
          />
          <BigStatLink
            href="/buyer/deposits"
            icon={<Wallet className="h-6 w-6" />}
            label="Cautions"
            value={counts.deposits}
            tone="blue"
          />
        </div>

        {/* Suggestions */}
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                Pour vous
              </div>
              <h2 className="mt-2 text-3xl font-extrabold">Suggestions</h2>
            </div>
            <Link
              href="/auctions"
              className="text-sm text-[var(--gold)] hover:underline inline-flex items-center gap-1.5"
            >
              Tout voir
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recommended.length === 0 ? (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-base text-[var(--foreground-muted)]">
              Aucune enchère active pour le moment.
            </div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-5">
              {recommended.slice(0, 8).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/** Desktop-only big stat tile. */
function BigStatLink({
  href,
  icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "gold" | "success" | "pink" | "blue";
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
    pink: {
      icon: "bg-pink-500/15 text-pink-400 border-pink-500/30",
      number: "text-pink-400",
    },
    blue: {
      icon: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      number: "text-blue-400",
    },
  }[tone];
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)] transition-all"
    >
      <div
        className={`h-12 w-12 rounded-xl border flex items-center justify-center mb-5 ${accent.icon}`}
      >
        {icon}
      </div>
      <div
        className={`text-5xl font-black tabular-nums leading-none ${accent.number}`}
      >
        {value}
      </div>
      <div className="mt-3 text-sm font-semibold text-[var(--foreground-muted)] group-hover:text-foreground transition-colors">
        {label}
      </div>
      <ArrowRight className="absolute top-5 right-5 h-4 w-4 text-[var(--foreground-subtle)] group-hover:text-[var(--gold)] group-hover:translate-x-1 transition-all" />
    </Link>
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
