"use client";

import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
}

/**
 * Buy-now button — same pill shape as the "Rejoindre l'enchère" primary
 * CTA so the two stack cleanly, but visually distinct: outlined gold on
 * a transparent surface instead of filled gold. Communicates "secondary
 * action of equal weight" without competing with the primary CTA.
 */
export function BuyNowButton({ auction }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  if (!auction.buyNowPrice) return null;
  // Buy-now only valid while the auction is accepting bids (PLAN §20).
  // Hide the button entirely on ended/cancelled/under-review etc. — the
  // result banner already tells the user what state the auction is in.
  const isLive = auction.status === "active" || auction.status === "ending";
  if (!isLive) return null;

  const isOwnAuction = user?.id === auction.seller.id;

  function handleClick() {
    if (!user) {
      router.push(
        `/login?redirect=/auctions/${auction.id}?action=buy-now`,
      );
      return;
    }
    if (isOwnAuction) {
      toast("Vous ne pouvez pas acheter votre propre enchère", "warning");
      return;
    }
    if (user.kycStatus !== "verified") {
      toast("Vous devez vérifier votre identité avant l'achat", "warning");
      router.push("/kyc/start");
      return;
    }
    router.push(
      `/payment/checkout?type=final&amount=${auction.buyNowPrice}&auction=${auction.id}&buy_now=1`,
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isOwnAuction}
      className="block w-full h-14 rounded-full bg-transparent border-2 border-[var(--gold)] text-[var(--gold)] font-extrabold text-[15px] flex items-center justify-center gap-2 hover:bg-[var(--gold-faint)] active:scale-[0.99] transition-[background,transform] disabled:opacity-50 disabled:pointer-events-none"
    >
      <Zap className="h-5 w-5" />
      Achat immédiat à {formatPrice(auction.buyNowPrice)}
    </button>
  );
}
