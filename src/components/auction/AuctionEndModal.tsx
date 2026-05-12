"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Trophy,
  Heart,
  XCircle,
  Hourglass,
  Wallet,
  ArrowRight,
  PartyPopper,
} from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAuction } from "@/lib/realtime";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
  userId: string | null | undefined;
}

type Outcome =
  | { kind: "winner"; finalPrice: number; finalPaid: boolean }
  | { kind: "outbid"; winningPrice: number }
  | { kind: "reserve_top"; topPrice: number }
  | { kind: "reserve_other" }
  | { kind: "cancelled" };

const FINAL_STATES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

/**
 * Pops once when an auction the user participated in reaches a final state —
 * either on initial load (if they navigated to a freshly-ended auction) or
 * mid-session via realtime (if it ended while they were watching). Per-user
 * per-auction "seen" flag in localStorage so we don't re-pop on every reload.
 */
export function AuctionEndModal({ auction: initial, userId }: Props) {
  const auction = useRealtimeAuction(initial);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!FINAL_STATES.has(auction.status)) return;

    const seenKey = `auction-end-seen:${auction.id}:${userId}`;
    if (typeof window !== "undefined" && localStorage.getItem(seenKey)) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();

      // Did this user place at least one bid? If not, no popup.
      const { count } = await supabase
        .from("bids")
        .select("id", { count: "exact", head: true })
        .eq("auction_id", auction.id)
        .eq("user_id", userId);
      if ((count ?? 0) === 0) return;
      if (cancelled) return;

      // Cancelled by seller / admin
      if (auction.status === "cancelled") {
        setOutcome({ kind: "cancelled" });
        setOpen(true);
        markSeen(seenKey);
        return;
      }

      // Reserve missed → seller decides → either pending_seller_decision
      // (waiting) or reserve_not_met (rejected).
      if (
        auction.status === "pending_seller_decision" ||
        auction.status === "reserve_not_met"
      ) {
        // Round-21 audit fix H-1: bids.user_id is no longer publicly
        // readable. The is_top_bidder() RPC is SECURITY DEFINER so it
        // can answer the comparison without leaking other users' IDs.
        const { data: wasTop } = await supabase.rpc("is_top_bidder", {
          p_auction_id: auction.id,
          p_user_id: userId,
        });
        if (wasTop && auction.status === "pending_seller_decision") {
          setOutcome({ kind: "reserve_top", topPrice: auction.currentPrice });
        } else {
          setOutcome({ kind: "reserve_other" });
        }
        setOpen(true);
        markSeen(seenKey);
        return;
      }

      // Ended normally — winner or outbid. Use is_top_bidder() RPC
      // (round-21 audit fix H-1) instead of reading bids.user_id, which
      // is no longer publicly readable.
      const { data: isWinner } = await supabase.rpc("is_top_bidder", {
        p_auction_id: auction.id,
        p_user_id: userId,
      });

      if (isWinner) {
        // We can read our OWN top bid amount (owner clause on the new
        // bids RLS). Take the user's highest bid as the final price.
        const { data: own } = await supabase
          .from("bids")
          .select("amount")
          .eq("auction_id", auction.id)
          .eq("user_id", userId)
          .order("amount", { ascending: false })
          .limit(1);
        const { data: paid } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", userId)
          .eq("auction_id", auction.id)
          .eq("type", "final_payment")
          .eq("status", "completed")
          .limit(1);
        setOutcome({
          kind: "winner",
          finalPrice: Number(own?.[0]?.amount ?? auction.currentPrice),
          finalPaid: (paid ?? []).length > 0,
        });
      } else {
        setOutcome({
          kind: "outbid",
          winningPrice: auction.currentPrice,
        });
      }
      setOpen(true);
      markSeen(seenKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [auction.id, auction.status, auction.currentPrice, userId]);

  if (!outcome) return null;

  const view = (() => {
    switch (outcome.kind) {
      case "winner":
        return {
          icon: (
            <div className="relative h-20 w-20 mx-auto">
              <div className="absolute inset-0 rounded-full bg-[var(--gold-faint)] animate-ping" />
              <div className="relative h-20 w-20 rounded-full gradient-gold flex items-center justify-center shadow-[var(--shadow-gold)]">
                <Trophy className="h-10 w-10 text-black" />
              </div>
            </div>
          ),
          title: "Félicitations ! Vous avez gagné l'enchère",
          body: outcome.finalPaid
            ? `Vous avez payé ${formatPrice(outcome.finalPrice)} intégralement. Contactez le vendeur pour récupérer la voiture.`
            : `Offre gagnante : ${formatPrice(outcome.finalPrice)}. Finalisez le paiement pour récupérer la voiture avant la fin du délai.`,
          primary: outcome.finalPaid ? (
            <Link href="/buyer/bids" className="block">
              <Button size="md" fullWidth>
                <Trophy className="h-4 w-4" />
                Mes victoires
              </Button>
            </Link>
          ) : (
            <Link
              href={`/payment/checkout?type=final&auction=${auction.id}&amount=${Math.max(0, outcome.finalPrice - auction.participationDeposit)}`}
              className="block"
            >
              <Button size="md" fullWidth>
                <Wallet className="h-4 w-4" />
Finaliser le paiement
              </Button>
            </Link>
          ),
        };
      case "outbid":
        return {
          icon: (
            <div className="h-20 w-20 mx-auto rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--foreground-muted)]">
              <Heart className="h-10 w-10" />
            </div>
          ),
          title: "Désolé, vous n'avez pas gagné cette fois",
          body: `L'offre gagnante était de ${formatPrice(outcome.winningPrice)}. Nous vous rembourserons la caution de participation sous 24 heures. Bonne chance pour la prochaine enchère !`,
          primary: (
            <Link href="/auctions" className="block">
              <Button size="md" fullWidth>
                <ArrowRight className="h-4 w-4" />
                Parcourir d&apos;autres enchères
              </Button>
            </Link>
          ),
        };
      case "reserve_top":
        return {
          icon: (
            <div className="h-20 w-20 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400">
              <Hourglass className="h-10 w-10" />
            </div>
          ),
          title: "En attente de la décision du vendeur",
          body: `Vous étiez le meilleur enchérisseur à ${formatPrice(outcome.topPrice)}, mais le prix de réserve n'a pas été atteint. Le vendeur a 3 jours pour décider d'accepter ou de refuser.`,
          primary: (
            <Button size="md" fullWidth onClick={() => setOpen(false)}>
              <PartyPopper className="h-4 w-4" />
Compris, j&apos;attends
            </Button>
          ),
        };
      case "reserve_other":
        return {
          icon: (
            <div className="h-20 w-20 mx-auto rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--foreground-muted)]">
              <Heart className="h-10 w-10" />
            </div>
          ),
          title: "L'enchère n'a pas atteint le prix de réserve",
          body: "Le vendeur n'a pas accepté l'offre la plus haute. Nous vous rembourserons la caution de participation prochainement.",
          primary: (
            <Link href="/auctions" className="block">
              <Button size="md" fullWidth>
                <ArrowRight className="h-4 w-4" />
                Autres enchères
              </Button>
            </Link>
          ),
        };
      case "cancelled":
        return {
          icon: (
            <div className="h-20 w-20 mx-auto rounded-full bg-red-500/15 flex items-center justify-center text-[var(--danger)]">
              <XCircle className="h-10 w-10" />
            </div>
          ),
          title: "Enchère annulée",
          body: "Le vendeur ou l'administration a annulé cette enchère. Nous vous rembourserons la caution de participation intégralement.",
          primary: (
            <Link href="/auctions" className="block">
              <Button size="md" fullWidth>
                Autres enchères
              </Button>
            </Link>
          ),
        };
    }
  })();

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="">
      <div className="text-center space-y-4 py-2">
        {view.icon}
        <div>
          <h2 className="text-xl font-extrabold">{view.title}</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            {view.body}
          </p>
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
          Fermer
        </Button>
        {view.primary}
      </ModalFooter>
    </Modal>
  );
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore
  }
}
