import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ListingQueue, type QueueListing } from "./ListingQueue";
import {
  ManualListingForm,
  type AdminCategory,
  type AdminSeller,
} from "./ManualListingForm";
import { DIAGNOSTIC_SELECT, toDiagnostic, type Diagnostic } from "@/lib/diagnostics";

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
       photos:listing_photos (storage_path, sort_order, is_cover)`,
    )
    .order("created_at", { ascending: false })
    .limit(120);

  if (status && status !== "all") query = query.eq("status", status);

  // Everything the "créer une annonce" panel needs: who we can publish for,
  // and what a listing in each category is made of.
  const [{ data }, profRes, catRes, attrRes] = await Promise.all([
    query,
    admin.from("profiles").select("id, full_name, phone").order("full_name"),
    admin
      .from("categories")
      .select("id, parent_id, label_fr, kind, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("category_attributes")
      .select("category_id, field_key, label, data_type, options, unit, required, sort_order")
      .order("sort_order"),
  ]);

  const sellers: AdminSeller[] = (profRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? "Sans nom",
    phone: (p.phone as string | null) ?? null,
  }));

  type CatRow = { id: string; parent_id: string | null; label_fr: string; kind: string };
  type AttrRow = {
    category_id: string; field_key: string; label: string; data_type: string;
    options: { value: string; label: string }[] | null;
    unit: string | null; required: boolean;
  };
  const catRows = (catRes.data ?? []) as CatRow[];
  const attrRows = (attrRes.data ?? []) as AttrRow[];
  const parents = catRows.filter((c) => c.parent_id == null);

  const formCategories: AdminCategory[] = catRows
    .filter((c) => c.parent_id != null)
    .map((c) => ({
      id: c.id,
      label: c.label_fr,
      kind: c.kind === "part" ? "part" : "vehicle",
      groupLabel: parents.find((p) => p.id === c.parent_id)?.label_fr ?? "Autres",
      attributes: attrRows
        .filter((a) => a.category_id === c.id)
        .map((a) => ({
          fieldKey: a.field_key,
          label: a.label,
          dataType: (["number", "text", "boolean", "select"] as const).includes(
            a.data_type as "text",
          )
            ? (a.data_type as "number" | "text" | "boolean" | "select")
            : "text",
          options: a.options ?? null,
          unit: a.unit,
          required: a.required,
        })),
    }));

  // Existing diagnostics for the listings on screen, drafts included — one read
  // rather than one per row.
  const listingIds = (data ?? []).map((r) => (r as { id: string }).id);
  const diagnostics = new Map<string, Diagnostic>();
  if (listingIds.length > 0) {
    const { data: diagRows } = await admin
      .from("vehicle_diagnostics")
      .select(DIAGNOSTIC_SELECT)
      .in("listing_id", listingIds);
    for (const row of diagRows ?? []) {
      const d = toDiagnostic(row as Parameters<typeof toDiagnostic>[0]);
      const key = (row as { listing_id: string | null }).listing_id;
      if (key) diagnostics.set(key, d);
    }
  }

  type Row = {
    id: string; title: string; description: string | null; price: number | null;
    negotiable: boolean; governorate: string; status: string; condition: string | null;
    contact_name: string | null; contact_phone: string | null;
    attributes: Record<string, unknown> | null; rejection_reason: string | null;
    seller_credit_id: string | null; fee_payment_id: string | null;
    created_at: string; published_at: string | null; expires_at: string | null;
    seller: { id: string; full_name: string | null; phone: string | null } | { id: string; full_name: string | null; phone: string | null }[] | null;
    category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
    photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
  };

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  // The fee payment behind each annonce, with its receipt.
  //
  // These were invisible: the payments console groups by auction_id and only
  // covers deposit_lock / buy_now / final_payment (0081), so a seller could
  // send a receipt for a listing fee and nobody would ever see it. The annonce
  // queue is where an admin already is when deciding about that annonce, so
  // the money belongs here.
  const payIds = ((data ?? []) as Row[]).map((r) => r.fee_payment_id).filter(Boolean) as string[];
  const payById = new Map<string, {
    amount: number; status: string; receipts: string[]; uploadedAt: string | null;
  }>();
  if (payIds.length > 0) {
    const { data: pays } = await admin
      .from("payments")
      .select("id, amount, status, receipt_url, receipt_urls, receipt_uploaded_at")
      .in("id", payIds);
    await Promise.all(
      (pays ?? []).map(async (p) => {
        const many = Array.isArray(p.receipt_urls) ? (p.receipt_urls as string[]) : [];
        const one = typeof p.receipt_url === "string" && p.receipt_url ? [p.receipt_url] : [];
        const paths = [...new Set([...many, ...one])];

        // The receipts bucket is private, so the stored path renders as a
        // black square on its own. Signed for an hour, the same way the
        // deposits console does it.
        const signed = await Promise.all(
          paths.map(async (path) => {
            if (path.startsWith("http")) return path;
            const { data: sig } = await admin.storage
              .from("receipts")
              .createSignedUrl(path, 3600);
            return sig?.signedUrl ?? null;
          }),
        );

        payById.set(p.id as string, {
          amount: Number(p.amount ?? 0),
          status: (p.status as string) ?? "",
          receipts: signed.filter((u): u is string => Boolean(u)),
          uploadedAt: (p.receipt_uploaded_at as string | null) ?? null,
        });
      }),
    );
  }

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
      diagnostic: diagnostics.get(r.id) ?? null,
      payment: r.fee_payment_id ? payById.get(r.fee_payment_id) ?? null : null,
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
            publication</strong>, parce qu&apos;un refus n&apos;est pas une parution. Vous pouvez
            aussi <strong>créer une annonce vous-même</strong> pour un vendeur, sans frais.
          </>
        }
      />
      <div className="mt-6 space-y-4">
        <ManualListingForm sellers={sellers} categories={formCategories} />
        <ListingQueue listings={listings} counts={counts} activeStatus={status ?? "all"} />
      </div>
    </div>
  );
}
