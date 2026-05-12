import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { createClient } from "@/lib/supabase/server";
import { listSellers } from "@/lib/db";
import { SellersBrowser } from "./SellersBrowser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Sellers directory — kept admin-only on purpose. Buyers must not be able
 * to browse or identify sellers (the platform mediates every interaction
 * — that's the whole "middle-man" promise). Anyone but an admin gets a
 * 404 so the route doesn't even hint at its existence.
 */
export default async function SellersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = (user?.user_metadata as { role?: string } | null)?.role;
  if (role !== "admin") notFound();

  const sellers = await listSellers(supabase);

  // Active-auction count per seller — ONE batched query instead of N+1.
  // Previously we fired a separate COUNT-head request per row; on a
  // 100-seller list that was 100 round-trips serialized through Supabase.
  // Now we pull seller_id for every live row in a single SELECT and
  // bucket client-side. Trades a tiny amount of in-memory work for ~99
  // fewer network calls.
  const sellerIds = sellers.map((s) => s.id);
  const liveByseller = new Map<string, number>();
  if (sellerIds.length > 0) {
    const { data: liveRows } = await supabase
      .from("auctions")
      .select("seller_id")
      .in("seller_id", sellerIds)
      .in("status", ["active", "ending"]);
    for (const r of liveRows ?? []) {
      const id = (r as { seller_id: string }).seller_id;
      liveByseller.set(id, (liveByseller.get(id) ?? 0) + 1);
    }
  }

  const enriched = sellers.map((s) => ({
    ...s,
    liveCount: liveByseller.get(s.id) ?? 0,
  }));

  return (
    <AppShell noTopBar>
      <ScreenHeader title="Vendeurs (admin)" backHref={null} />
      <div className="lg:max-w-[var(--max-w-app)] lg:mx-auto">
        <SellersBrowser sellers={enriched} />
      </div>
    </AppShell>
  );
}
