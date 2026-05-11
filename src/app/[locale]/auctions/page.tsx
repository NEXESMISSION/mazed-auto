import { AppShell } from "@/components/layout/AppShell";
import { BrowseHeader } from "@/components/layout/BrowseHeader";
import { getLiveAuctionsCached } from "@/lib/home-cache";
import { AuctionsBrowser } from "./AuctionsBrowser";
import { BrowseViewToggle } from "./BrowseViewToggle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function AuctionsPage({ searchParams }: Props) {
  const [{ view }, auctions] = await Promise.all([
    searchParams,
    // Cached 30s — public read, RLS filters out non-live auctions
    // already, so the full list is shareable across users.
    getLiveAuctionsCached(),
  ]);

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
