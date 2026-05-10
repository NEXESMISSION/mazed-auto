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
      <ScreenHeader title="Vendeurs (admin)" backHref={null} />
      <div className="lg:max-w-[var(--max-w-app)] lg:mx-auto">
        <SellersBrowser sellers={enriched} />
      </div>
    </AppShell>
  );
}
