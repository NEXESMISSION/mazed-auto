/* eslint-disable react-hooks/purity -- Server Component.
 * The react-hooks v7 purity rule governs the CLIENT render path: it forbids
 * impure reads (Date.now(), Math.random()) during a render React may replay.
 * This module is an async Server Component — it runs once, per request, on the
 * server, and reading the clock is the correct way to answer "what is overdue"
 * or "which badge has lapsed". There is no render to replay. */
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PublishWizard, type InitialDraft, type WizardCategory } from "./PublishWizard";
import {
  PRODUCT_SELECT,
  resolveListingFee,
  toProduct,
  type Product,
} from "@/lib/products";
import {
  describePublishing,
  listingTypeFor,
  pickScope,
  type ListingKind,
  type PublishingNote,
} from "@/lib/publication";
import { memberShops, quotaStatus } from "@/lib/shops/server";

export const dynamic = "force-dynamic";

/**
 * Publier une annonce — the v3 sell flow.
 *
 * Everything the wizard needs is resolved here, server-side, because two of
 * these numbers are money and must not be a client's opinion: what publishing
 * costs in each category, and how many publications the seller already owns.
 */
export default async function NewListingPage() {
  const locale = await getLocale();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/annonces/nouvelle`)}`);
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[13px] text-muted">Service indisponible.</p>
      </main>
    );
  }

  const [catRes, prodRes, creditRes, profRes, draftRes] = await Promise.all([
    admin
      .from("categories")
      .select("id, parent_id, slug, label_fr, kind, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    admin.from("products").select(PRODUCT_SELECT).eq("is_active", true),
    admin
      .from("seller_credits")
      .select("quota_total, quota_used, expires_at, status")
      .eq("seller_id", user.id)
      .eq("status", "active"),
    admin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    // The draft this seller left behind, if any. Publishing a car takes long
    // enough that a phone call, a dead battery or a mistaken back gesture will
    // interrupt it — and until now that threw the whole form away.
    admin
      .from("listings")
      .select(
        `id, category_id, title, description, price, price_on_request, negotiable,
         condition, governorate, attributes, contact_name, contact_phone, updated_at,
         photos:listing_photos (storage_path, sort_order),
         fitments:listing_fitments (make, model, year_from, year_to)`,
      )
      .eq("seller_id", user.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  type CatRow = {
    id: string; parent_id: string | null; slug: string;
    label_fr: string; kind: string; sort_order: number;
  };
  const catRows = (catRes.data ?? []) as CatRow[];
  const parents = catRows.filter((c) => c.parent_id == null);

  // `category_attributes` is no longer read here. The wizard asks structured
  // questions of its own — make and model from a picker, fuel and box as chips
  // — instead of rendering whatever rows that table happens to hold, which is
  // what let free text into columns buyers filter on.
  const categories: WizardCategory[] = catRows
    .filter((c) => c.parent_id != null)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label_fr,
      kind: c.kind === "part" ? "part" : "vehicle",
      groupLabel: parents.find((p) => p.id === c.parent_id)?.label_fr ?? "Autres",
    }));

  const products: Product[] = (prodRes.data ?? []).map((r) =>
    toProduct(r as Parameters<typeof toProduct>[0]),
  );

  // How publishing works for this person, per kind of annonce — under one of
  // their shops or personally, free or not, and how much room is left. The
  // same `pickScope` the draft route files the annonce with, so what the
  // wizard says is what will happen.
  const shops = await memberShops(admin, user!.id);
  const kinds: ListingKind[] = ["vehicle", "part"];
  const notes = await Promise.all(
    kinds.map(async (kind) => {
      const personal = await quotaStatus(admin, user!.id, null, listingTypeFor(kind));
      const scope = pickScope(shops, kind);
      const summary = "kind" in scope ? undefined : shops.find((s) => s.id === scope.shopId);
      const shop = summary && !("kind" in scope)
        ? { summary, quota: await quotaStatus(admin, user!.id, summary.id, scope.listingType) }
        : null;
      return { personal, note: describePublishing({ kind, personal, shop }) };
    }),
  );
  const publishing = { vehicle: notes[0].note, part: notes[1].note } as Record<ListingKind, PublishingNote>;
  // The per-annonce fee, packs and welcome allowance only exist while the
  // free switch is off (D-P1); otherwise there is nothing to spend them on.
  const legacyFee = notes[0].personal.free === false;

  // What each category costs, resolved here so the wizard never guesses. The
  // parent goes in too: a price set on « Pièces de rechange » covers all of its
  // sub-categories (0167), which is how parts are free.
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const feeByCategory: Record<string, number | null> = {};
  for (const c of categories) {
    feeByCategory[c.id] = publishing[c.kind].free
      ? 0
      : resolveListingFee(products, c.id, parentOf.get(c.id) ?? null)?.price ?? null;
  }

  const now = Date.now();
  const creditsLeft = !legacyFee ? 0 : (creditRes.data ?? []).reduce((n, c) => {
    if (new Date(c.expires_at as string).getTime() <= now) return n;
    return n + Math.max(0, (c.quota_total as number) - (c.quota_used as number));
  }, 0);

  // Read-only: showing the offer must never be what consumes it. The claim
  // happens once, in /api/annonces/[id]/submit, under a lock.
  let freeLeft = 0;
  if (legacyFee) {
    const { data: freeStatus } = await admin.rpc("free_listing_status", {
      p_seller_id: user!.id,
    });
    freeLeft = (freeStatus as { enabled?: boolean; remaining?: number } | null)?.enabled
      ? Number((freeStatus as { remaining?: number }).remaining) || 0
      : 0;
  }

  return (
    <PublishWizard
      categories={categories}
      feeByCategory={feeByCategory}
      creditsLeft={creditsLeft}
      freeLeft={freeLeft}
      publishing={publishing}
      defaultContactName={(profRes.data?.full_name as string | null) ?? ""}
      defaultContactPhone={(profRes.data?.phone as string | null) ?? ""}
      initialDraft={(draftRes.data as unknown as InitialDraft | null) ?? null}
      locale={locale}
    />
  );
}
