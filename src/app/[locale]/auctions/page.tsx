import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { listAuctions, mapAuction } from "@/lib/db";
import { AuctionsBrowser } from "./AuctionsBrowser";
import { NewestRibbon } from "@/components/home/NewestRibbon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ brand?: string; body?: string }>;
}

export default async function AuctionsPage({ searchParams }: Props) {
  const { brand, body } = await searchParams;
  const inHubMode = !brand && !body;

  const supabase = await createClient();
  const auctions = await listAuctions(supabase, {});

  let newest: Awaited<ReturnType<typeof listAuctions>> = [];
  if (inHubMode) {
    const { data } = await supabase
      .from("auctions")
      .select("*, seller:sellers(*)")
      .in("status", ["active", "ending"])
      .order("created_at", { ascending: false })
      .limit(10);
    newest = (data ?? []).map((r) =>
      mapAuction(r as Parameters<typeof mapAuction>[0]),
    );
  }

  return (
    <AppShell noTopBar>
      {inHubMode && <NewestRibbon items={newest} />}
      <AuctionsBrowser initial={auctions} />
    </AppShell>
  );
}
