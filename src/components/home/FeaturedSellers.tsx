import { Link } from "@/i18n/navigation";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";
import { listSellers } from "@/lib/db";

/**
 * Featured-sellers list — section header + a card with a divided list of
 * sellers (avatar, name + verified, listing count, Follow pill). Mirrors the
 * "Featured Sellers" block from the reference design.
 */
export async function FeaturedSellers() {
  const supabase = await createClient();
  const sellers = (await listSellers(supabase)).slice(0, 4);
  if (sellers.length === 0) return null;

  // Active-auction count per seller — drives the secondary line.
  const counts = await Promise.all(
    sellers.map((s) =>
      supabase
        .from("auctions")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", s.id)
        .in("status", ["active", "ending"])
        .then((r) => r.count ?? 0),
    ),
  );

  return (
    <section className="mt-7 px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">Vendeurs en vedette</h2>
        <Link
          href="/sellers"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        {sellers.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 p-3">
            <Link
              href={`/profile/${s.username}`}
              className="flex items-center gap-3 flex-1 min-w-0 group"
            >
              <Avatar size="md" src={s.avatarUrl} alt={s.displayName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm truncate group-hover:text-[var(--gold)] transition-colors">
                    {s.displayName}
                  </span>
                  {s.verifiedKyc && (
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-[var(--foreground-muted)] tabular-nums mt-0.5">
                  {counts[i]} {counts[i] === 1 ? "enchère" : "enchères"} · {s.successfulDeals} {s.successfulDeals === 1 ? "vente" : "ventes"}
                </div>
              </div>
            </Link>
            <FollowPill sellerId={s.id} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Visual-only Follow pill matching the reference's secondary outline button.
 * Real follow wiring lives on the seller profile — this is a marketing
 * affordance to keep the home compositional. Tapping deep-links to the seller.
 */
function FollowPill({ sellerId }: { sellerId: string }) {
  return (
    <Link
      href={`/profile/${sellerId}`}
      className="px-4 h-8 rounded-full border border-[var(--gold)]/40 bg-[var(--gold-faint)] text-[var(--gold)] text-[11px] font-bold inline-flex items-center hover:bg-[var(--gold)] hover:text-black transition-colors"
    >
      Suivre
    </Link>
  );
}
