import { AppShell } from "@/components/layout/AppShell";
import { Hero } from "@/components/home/Hero";
import { SignedInHero } from "@/components/home/SignedInHero";
import { RecommendedRail } from "@/components/home/RecommendedRail";
import { FeaturedSellers } from "@/components/home/FeaturedSellers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as {
    firstName?: string;
    role?: "buyer" | "seller" | "admin";
    kycStatus?: "none" | "pending" | "verified" | "rejected";
  };
  const isSignedIn = Boolean(user);

  // Auctions the user has bid on — used so the Recommended rail doesn't
  // surface auctions they're already engaged with.
  let myBidIds: string[] = [];
  if (user) {
    const { data: rawBids } = await supabase
      .from("bids")
      .select("auction_id")
      .eq("user_id", user.id);
    myBidIds = Array.from(
      new Set((rawBids ?? []).map((b) => b.auction_id).filter(Boolean)),
    ) as string[];
  }

  return (
    <AppShell noTopBar={isSignedIn}>
      {isSignedIn && user ? (
        <SignedInHero
          userId={user.id}
          firstName={meta.firstName ?? ""}
          kycVerified={meta.kycStatus === "verified"}
          role={meta.role ?? "buyer"}
        />
      ) : (
        <Hero />
      )}

      <RecommendedRail excludeIds={myBidIds} />
      <FeaturedSellers />
    </AppShell>
  );
}
