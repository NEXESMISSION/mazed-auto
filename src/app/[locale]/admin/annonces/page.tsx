import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ListingQueue, type QueueListing } from "./ListingQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Annonces — the v3 moderation queue.
 *
 * Ordered by what is waiting on US, not by date: listings in review first,
 * then paid-but-unpaid-for, then everything else. A queue sorted by creation
 * date makes the admin do the triage the page should have done.
 */
export default async function AdminAnnoncesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = getServiceSupabase();

  if (!admin) {
    return (
      <div className="pb-16">
        <AdminPageHeader eyebrow="Catalogue" title="Annonces" />
        <p className="mt-6 text-[13px] text-muted">Service non configuré.</p>
      </div>
    );
  }

  let query = admin
    .from("listings")
    .select(
      `id, title, description, price, negotiable, governorate, status, condition,
       contact_name, contact_phone, attributes, rejection_reason,
       seller_credit_id, fee_payment_id, created_at, published_at, expires_at,
       seller:profiles!listings_seller_id_fkey (id, full_name, phone),
       category:categories (label_fr, kind),
       photos:listing_photos (storage_path, sort_order)`,
    )
    .order("created_at", { ascending: false })
    .limit(120);

  if (status && status !== "all") query = query.eq("status", status);

  const { data } = await query;

  type Row = {
    id: string; title: string; description: string | null; price: number | null;
    negotiable: boolean; governorate: string; status: string; condition: string | null;
    contact_name: string | null; contact_phone: string | null;
    attributes: Record<string, unknown> | null; rejection_reason: string | null;
    seller_credit_id: string | null; fee_payment_id: string | null;
    created_at: string; published_at: string | null; expires_at: string | null;
    seller: { id: string; full_name: string | null; phone: string | null } | { id: string; full_name: string | null; phone: string | null }[] | null;
    category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
    photos: { storage_path: string; sort_order: number }[] | null;
  };

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const listings: QueueListing[] = ((data ?? []) as Row[]).map((r) => {
    const seller = one(r.seller);
    const category = one(r.category);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      price: r.price != null ? Number(r.price) : null,
      negotiable: r.negotiable,
      governorate: r.governorate,
      status: r.status,
      condition: r.condition,
      category: category?.label_fr ?? "—",
      categoryKind: category?.kind ?? "other",
      sellerName: seller?.full_name ?? "—",
      sellerPhone: seller?.phone ?? null,
      contactName: r.contact_name,
      // The queue is the one screen that legitimately shows the number: the
      // admin has to be able to call the seller about their own listing.
      contactPhone: r.contact_phone,
      attributes: (r.attributes ?? {}) as Record<string, unknown>,
      rejectionReason: r.rejection_reason,
      paidWith: r.seller_credit_id ? "credit" : r.fee_payment_id ? "payment" : "waived",
      createdAt: r.created_at,
      publishedAt: r.published_at,
      expiresAt: r.expires_at,
      photos: (r.photos ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => p.storage_path),
    };
  });

  const rank: Record<string, number> = {
    pending_review: 0, pending_payment: 1, rejected: 2, draft: 3,
    published: 4, expired: 5, sold: 6, archived: 7,
  };
  listings.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));

  const counts = listings.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="pb-16">
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Annonces"
        description={
          <>
            La file de modération v3. Valider met l&apos;annonce en ligne pour la durée
            achetée ; refuser la renvoie au vendeur avec un motif — et lui <strong>rend sa
            publication</strong>, parce qu&apos;un refus n&apos;est pas une parution.
          </>
        }
      />
      <div className="mt-6">
        <ListingQueue listings={listings} counts={counts} activeStatus={status ?? "all"} />
      </div>
    </div>
  );
}
