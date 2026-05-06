import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { listAuctions, listSellers } from "@/lib/db";
import { AuctionsBrowser } from "./AuctionsBrowser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuctionsPage() {
  const supabase = await createClient();
  // Show every auction on the search page — not just the active/ending ones.
  // Users want to find historical results, scheduled previews, and ended deals
  // alongside live ones; status is filterable client-side via the search box.
  const [auctions, sellers] = await Promise.all([
    listAuctions(supabase, {}),
    listSellers(supabase),
  ]);

  return (
    <AppShell noTopBar>
      <AuctionsBrowser initial={auctions} sellers={sellers} />
    </AppShell>
  );
}
