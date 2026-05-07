import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { createClient } from "@/lib/supabase/server";
import { listSellers } from "@/lib/db";
import { SellersBrowser } from "./SellersBrowser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SellersPage() {
  const supabase = await createClient();
  const sellers = await listSellers(supabase);

  // Active-auction count per seller — fetched in parallel so the rows can
  // surface a "live now" hint alongside the all-time deals number.
  const liveCounts = await Promise.all(
    sellers.map((s) =>
      supabase
        .from("auctions")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", s.id)
        .in("status", ["active", "ending"])
        .then((r) => r.count ?? 0),
    ),
  );

  const enriched = sellers.map((s, i) => ({ ...s, liveCount: liveCounts[i] }));

  return (
    <AppShell noTopBar>
      <ScreenHeader title="Vendeurs" backHref={null} />
      <SellersBrowser sellers={enriched} />
    </AppShell>
  );
}
