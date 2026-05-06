import Link from "next/link";
import { Heart } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow } from "@/lib/db";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: Auction[] = [];
  if (user) {
    const { data: rows } = await supabase
      .from("watchlist")
      .select("auction_id, auctions(*, seller:sellers(*))")
      .eq("user_id", user.id);
    items = (rows ?? [])
      .map((r) =>
        r.auctions ? mapAuction(r.auctions as unknown as AuctionRow) : null,
      )
      .filter(Boolean) as Auction[];
  }

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Heart className="h-6 w-6 text-[var(--gold)]" />
Mes favoris
        </h1>

        {!user ? (
          <Empty title="Connectez-vous pour voir vos favoris">
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </Empty>
        ) : items.length === 0 ? (
          <Empty
            title="Vos favoris sont vides"
            subtitle="Ajoutez des enchères à suivre via le bouton cœur"
          >
            <Link href="/auctions">
              <Button size="md">Parcourir les enchères</Button>
            </Link>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {items.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Empty({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 space-y-3">
      <div className="font-bold text-base">{title}</div>
      {subtitle && (
        <p className="text-sm text-[var(--foreground-muted)]">{subtitle}</p>
      )}
      {children}
    </div>
  );
}
