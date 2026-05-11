import { Link } from "@/i18n/navigation";
import { Plus, ArrowRight, Gavel } from "lucide-react";
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
        <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-5">
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
      {/* MOBILE wrapper — narrow, unchanged */}
      <div className="lg:hidden max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
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

      {/* DESKTOP wrapper — wider container, magazine header, bigger gap */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              <Gavel className="h-3.5 w-3.5" />
              Vendeur
            </div>
            <h1 className="mt-2 text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
              Mes <span className="gradient-gold-text">enchères</span>
            </h1>
            <p className="mt-3 text-base text-[var(--foreground-muted)] max-w-2xl">
              Toutes vos annonces, regroupées par état. Cliquez sur une
              enchère pour voir l&apos;activité détaillée.
            </p>
          </div>
          <Link
            href="/seller/new/step-1"
            className="group shrink-0 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.99] transition-transform"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            Nouvelle enchère
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <SellerAuctionsList list={list} />
      </div>
    </AppShell>
  );
}
