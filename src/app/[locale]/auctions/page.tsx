import { AppShell } from "@/components/layout/AppShell";
import { BrowseHeader } from "@/components/layout/BrowseHeader";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { AuctionsBrowser } from "./AuctionsBrowser";
import { BrowseViewToggle } from "./BrowseViewToggle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function AuctionsPage({ searchParams }: Props) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const auctions = await listAuctions(supabase, {});

  return (
    <AppShell noTopBar>
      <BrowseHeader
        eyebrow="Mazed Auto"
        title="Parcourir"
        action={<BrowseViewToggle />}
      />
      <div className="lg:max-w-[var(--max-w-wide)] lg:mx-auto">
        <AuctionsBrowser
          initial={auctions}
          classicMode={view === "classic"}
        />
      </div>
    </AppShell>
  );
}
