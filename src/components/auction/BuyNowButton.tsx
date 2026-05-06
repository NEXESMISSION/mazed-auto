"use client";

import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
}

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
    <Button
      size="md"
      variant="outline"
      fullWidth
      onClick={handleClick}
      disabled={isOwnAuction}
    >
      <Zap className="h-4 w-4" />
      Achat immédiat à {formatPrice(auction.buyNowPrice)}
    </Button>
  );
}
