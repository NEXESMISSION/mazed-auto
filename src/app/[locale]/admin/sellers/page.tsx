import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SellerDesk } from "./SellerDesk";
import { PRODUCT_SELECT, toProduct, type Product } from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SellerRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  listings: number;
  creditsLeft: number;
  badge: { expiresAt: string; note: string | null } | null;
};

/**
 * Forfaits & badges — the desk where an admin credits a seller's account and
 * grants or pulls their badge.
 *
 * Both actions exist because both are human decisions:
 *   • a pack is usually paid by bank transfer, and a person validates the
 *     receipt anyway — so the quota lands here;
 *   • the badge is sold, but granted only after someone actually checks the
 *     seller. That check is the badge's entire meaning.
 */
export default async function AdminSellersPage() {
  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <div className="pb-16">
        <AdminPageHeader eyebrow="Argent" title="Forfaits & badges" />
        <p className="mt-6 text-[13px] text-muted">Service non configuré.</p>
      </div>
    );
  }

  const [profRes, creditRes, badgeRes, listingRes, prodRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, phone, role").order("full_name"),
    admin
      .from("seller_credits")
      .select("seller_id, quota_total, quota_used, expires_at, status"),
    admin
      .from("seller_badges")
      .select("seller_id, expires_at, note, revoked_at")
      .is("revoked_at", null),
    admin.from("listings").select("seller_id"),
    admin.from("products").select(PRODUCT_SELECT).eq("is_active", true).order("sort_order"),
  ]);

  const now = Date.now();

  const creditsBySeller = new Map<string, number>();
  for (const c of creditRes.data ?? []) {
    if (c.status !== "active") continue;
    if (new Date(c.expires_at as string).getTime() <= now) continue;
    const left = Math.max(0, (c.quota_total as number) - (c.quota_used as number));
    creditsBySeller.set(
      c.seller_id as string,
      (creditsBySeller.get(c.seller_id as string) ?? 0) + left,
    );
  }

  const badgeBySeller = new Map<string, { expiresAt: string; note: string | null }>();
  for (const b of badgeRes.data ?? []) {
    if (new Date(b.expires_at as string).getTime() <= now) continue; // lapsed = not a badge
    badgeBySeller.set(b.seller_id as string, {
      expiresAt: b.expires_at as string,
      note: (b.note as string | null) ?? null,
    });
  }

  const listingsBySeller = new Map<string, number>();
  for (const l of listingRes.data ?? []) {
    listingsBySeller.set(
      l.seller_id as string,
      (listingsBySeller.get(l.seller_id as string) ?? 0) + 1,
    );
  }

  const sellers: SellerRow[] = (profRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null)?.trim() || "— sans nom —",
    phone: (p.phone as string | null) ?? null,
    role: (p.role as string) ?? "individual",
    listings: listingsBySeller.get(p.id as string) ?? 0,
    creditsLeft: creditsBySeller.get(p.id as string) ?? 0,
    badge: badgeBySeller.get(p.id as string) ?? null,
  }));

  // Sellers first: someone with listings or credits is who this page is for.
  sellers.sort(
    (a, b) =>
      b.listings + b.creditsLeft * 2 - (a.listings + a.creditsLeft * 2) ||
      a.name.localeCompare(b.name),
  );

  const products: Product[] = (prodRes.data ?? []).map((r) =>
    toProduct(r as Parameters<typeof toProduct>[0]),
  );

  return (
    <div className="pb-16">
      <AdminPageHeader
        eyebrow="Argent"
        title="Forfaits & badges"
        description={
          <>
            Créditez un vendeur qui a payé un pack, et accordez — ou retirez — le badge
            « Vendeur vérifié ». Le badge n&apos;est jamais accordé par le paiement : il l&apos;est
            par vous, après vérification, et il disparaît de toutes les annonces à la seconde
            où vous le retirez.
          </>
        }
      />
      <div className="mt-6">
        <SellerDesk sellers={sellers} products={products} />
      </div>
    </div>
  );
}
