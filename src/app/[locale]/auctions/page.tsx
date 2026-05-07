import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { AuctionsBrowser } from "./AuctionsBrowser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuctionsPage() {
  const supabase = await createClient();
  // Show every auction on the browse page — not just active/ending ones.
  // Users want to find historical results, scheduled previews, and ended
  // deals alongside live ones; the brand + body filters live client-side.
  const auctions = await listAuctions(supabase, {});

  return (
    <AppShell noTopBar>
      <AuctionsBrowser initial={auctions} />
    </AppShell>
  );
}
