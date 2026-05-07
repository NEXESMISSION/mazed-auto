import { Link } from "@/i18n/navigation";
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
import { RenounceButton } from "./RenounceButton";

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
    // Two ways to be a winner:
    //  1. The auction's current_winner_id == me (set by finalize_auction
    //     when status='ended', or by forfeit_winner_deposit when status
    //     advances to 're_offered' and I'm the next bidder up).
    //  2. I have a completed final_payment (covers buy-now where the
    //     buyer never placed a bid — auction stays 'ended' but I paid).
    const [{ data: byWinner }, { data: paidTx }] = await Promise.all([
      supabase
        .from("auctions")
        .select("*, seller:sellers(*)")
        .eq("current_winner_id", user.id)
        .in("status", ["ended", "re_offered"]),
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

    // Pull any "paid but not currentWinner" auctions (buy-now from someone
    // who isn't the bid winner) to round out the list.
    const winnerIds = new Set(
      (byWinner ?? []).map((r) => (r as unknown as AuctionRow).id),
    );
    const paidOnly = Array.from(paidAuctionIds).filter(
      (id) => !winnerIds.has(id),
    );

    let paidOnlyRows: unknown[] = [];
    if (paidOnly.length > 0) {
      const { data } = await supabase
        .from("auctions")
        .select("*, seller:sellers(*)")
        .in("id", paidOnly)
        .eq("status", "ended");
      paidOnlyRows = data ?? [];
    }

    const allRows = [...(byWinner ?? []), ...paidOnlyRows];

    wins = await Promise.all(
      allRows.map(async (row) => {
        const a = mapAuction(row as AuctionRow);
        const hasPaid = paidAuctionIds.has(a.id);

        // Find the user's actual winning bid amount (might differ from
        // current_price if there were higher bids that later forfeited).
        const { data: myBid } = await supabase
          .from("bids")
          .select("amount")
          .eq("auction_id", a.id)
          .eq("user_id", user.id)
          .order("amount", { ascending: false })
          .limit(1)
          .maybeSingle();

        const myWinningBid = myBid
          ? Number(myBid.amount)
          : a.currentPrice; // buy-now path: no bid row

        return {
          auction: a,
          myWinningBid,
          finalPaid: hasPaid,
          deposit: a.participationDeposit,
        } satisfies Win;
      }),
    );
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
              const auctionLabel = `${w.auction.vehicle.make} ${w.auction.vehicle.model} ${w.auction.vehicle.year}`;
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
                      <div className="font-bold">{auctionLabel}</div>
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
                          ) : w.auction.status === "re_offered" ? (
                            <Badge variant="warning" size="sm">
                              Re-proposée à votre prix
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
                          {w.auction.paymentDeadline && (
                            <>
                              {" · "}
                              <DeadlineHint deadline={w.auction.paymentDeadline} />
                            </>
                          )}
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
                        <RenounceButton
                          auctionId={w.auction.id}
                          deposit={w.deposit}
                          auctionLabel={auctionLabel}
                        />
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

function DeadlineHint({ deadline }: { deadline: Date }) {
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) {
    return (
      <span className="font-semibold text-[var(--danger)] inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Délai dépassé
      </span>
    );
  }
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return (
    <span className="font-semibold text-amber-400">
      Délai : {days} jour{days > 1 ? "s" : ""}
    </span>
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
