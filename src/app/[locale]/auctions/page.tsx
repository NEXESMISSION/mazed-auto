import { AppShell } from "@/components/layout/AppShell";
import { BrowseHeader } from "@/components/layout/BrowseHeader";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { AuctionsBrowser } from "./AuctionsBrowser";

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

  return (
    <AppShell noTopBar>
      <BrowseHeader
        eyebrow="Mazed Auto"
        title={inHubMode ? "Parcourir" : "Résultats"}
      />
      <AuctionsBrowser initial={auctions} />
    </AppShell>
  );
}
