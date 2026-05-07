import Link from "next/link";
import { Trophy, Clock, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { RateSellerButton } from "@/components/auction/RateSellerButton";
import { MessageSellerButton } from "@/components/auction/MessageSellerButton";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Win {
  auction: Auction;
  myWinningBid: number;
  finalPaid: boolean;
  deposit: number;
}

export default async function WinsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let wins: Win[] = [];

  if (user) {
    // Two ways to win: be the top bidder on an ended auction, OR have a
    // completed final_payment (covers buy-now where the buyer never placed
    // a bid). Union the auction ids from both sources.
    const [{ data: myBids }, { data: paidTx }] = await Promise.all([
      supabase.from("bids").select("auction_id").eq("user_id", user.id),
      supabase
        .from("transactions")
        .select("auction_id")
        .eq("user_id", user.id)
        .eq("type", "final_payment")
        .eq("status", "completed"),
    ]);

    const paidAuctionIds = new Set(
      (paidTx ?? []).map((t) => t.auction_id).filter(Boolean) as string[],
    );
    const auctionIds = Array.from(
      new Set([
        ...(myBids ?? []).map((b) => b.auction_id),
        ...paidAuctionIds,
      ]),
    );

    if (auctionIds.length > 0) {
      const { data: ended } = await supabase
        .from("auctions")
        .select("*, seller:sellers(*)")
        .in("id", auctionIds)
        .eq("status", "ended");

      const checks = await Promise.all(
        (ended ?? []).map(async (row) => {
          const a = mapAuction(row as unknown as AuctionRow);
          const { data: top } = await supabase
            .from("bids")
            .select("user_id, amount")
            .eq("auction_id", a.id)
            .order("amount", { ascending: false })
            .order("placed_at", { ascending: true })
            .limit(1);

          const isTopBidder = top?.[0]?.user_id === user.id;
          const hasPaid = paidAuctionIds.has(a.id);

          // Not a winner unless they're the top bidder OR paid the final.
          if (!isTopBidder && !hasPaid) return null;

          // For buy-now where there's no bid from the user, use current_price
          // (which the buy_now RPC set to buy_now_price).
          const myWinningBid = isTopBidder
            ? Number(top![0].amount)
            : a.currentPrice;

          return {
            auction: a,
            myWinningBid,
            finalPaid: hasPaid,
            deposit: a.participationDeposit,
          } as Win;
        }),
      );
      wins = checks.filter((w): w is Win => w !== null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-[var(--gold)]" />
Mes ventes gagnées
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Félicitations ! Payez et contactez le vendeur pour finaliser la vente
          </p>
        </div>

        {!user ? (
          <Empty title="Connectez-vous pour voir vos victoires">
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </Empty>
        ) : wins.length === 0 ? (
          <Empty
            title="Aucune vente gagnée pour le moment"
            subtitle="Commencez à enchérir sur une voiture qui vous plaît"
          >
            <Link href="/auctions">
              <Button size="md">Parcourir les enchères</Button>
            </Link>
          </Empty>
        ) : (
          <div className="space-y-3">
            {wins.map((w) => {
              const remaining = Math.max(0, w.myWinningBid - w.deposit);
              return (
                <div
                  key={w.auction.id}
                  className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
                >
                  <div className="flex gap-3 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={w.auction.vehicle.imageUrls[0]}
                      alt=""
                      className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">
                        {w.auction.vehicle.make} {w.auction.vehicle.model}{" "}
                        {w.auction.vehicle.year}
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                        {w.auction.seller.displayName}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div>
                          <div className="text-[var(--foreground-muted)]">
                            Votre offre gagnante
                          </div>
                          <div className="font-bold gradient-gold-text tabular-nums">
                            {formatPrice(w.myWinningBid)}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="text-[var(--foreground-muted)]">
                            Statut du paiement
                          </div>
                          {w.finalPaid ? (
                            <Badge variant="success" size="sm">
                              Payé
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
En attente
                            </Badge>
                          )}
                        </div>
                      </div>
                      {w.finalPaid && (
                        <div className="mt-3 flex justify-end">
                          <RateSellerButton
                            sellerId={w.auction.seller.id}
                            sellerName={w.auction.seller.displayName}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {!w.finalPaid && (
                    <div className="border-t border-[var(--border)]">
                      <div className="p-3 bg-amber-500/5">
                        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                          <Clock className="h-3.5 w-3.5" />
                          Finalisez le paiement pour récupérer la voiture
                        </div>
                        <div className="text-xs text-[var(--foreground-muted)]">
                          Montant restant : {formatPrice(remaining)} (après déduction
                          de la caution {formatPrice(w.deposit)})
                        </div>
                      </div>
                      <div className="p-3 flex flex-col sm:flex-row gap-2">
                        <Link
                          href={`/payment/checkout?type=final&auction=${w.auction.id}&amount=${remaining}`}
                          className="flex-1"
                        >
                          <Button size="md" fullWidth>
                            Payer maintenant
                          </Button>
                        </Link>
                        <MessageSellerButton
                          sellerId={w.auction.seller.id}
                          auctionId={w.auction.id}
                          label="Contact"
                          size="md"
                          variant="secondary"
                        />
                        <Button size="md" variant="ghost" disabled>
                          <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
                          <span className="text-[var(--danger)]">Se retirer</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
      <Trophy className="h-12 w-12 text-[var(--gold)] mx-auto" />
      <div className="font-bold">{title}</div>
      {subtitle && (
        <p className="text-sm text-[var(--foreground-muted)]">{subtitle}</p>
      )}
      {children}
    </div>
  );
}
