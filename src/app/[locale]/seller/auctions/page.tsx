import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow } from "@/lib/db";
import type { Auction } from "@/lib/types";
import { SellerAuctionsList } from "./SellerAuctionsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SellerAuctionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold">Mes enchères</h1>
            <Link href="/seller/new/step-1">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nouvelle enchère
              </Button>
            </Link>
          </div>
          <div className="text-center py-16 space-y-3">
            <div className="font-bold">Connectez-vous pour gérer vos enchères</div>
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // Sweep expired auctions before reading so the seller never sees a
  // row that says "active" while the timer has clearly run out.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore — fetch falls back to the client-side endTime guard
  }

  const { data } = await supabase
    .from("auctions")
    .select("*, seller:sellers(*)")
    .eq("seller_id", user.id)
    .order("end_time", { ascending: true });

  const list: Auction[] = (data ?? []).map((r) =>
    mapAuction(r as unknown as AuctionRow),
  );

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">Mes enchères</h1>
          <Link href="/seller/new/step-1">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nouvelle enchère
            </Button>
          </Link>
        </div>

        <SellerAuctionsList list={list} />
      </div>
    </AppShell>
  );
}
