/* eslint-disable react-hooks/purity -- Server Component.
 * The react-hooks v7 purity rule governs the CLIENT render path: it forbids
 * impure reads (Date.now(), Math.random()) during a render React may replay.
 * This module is an async Server Component — it runs once, per request, on the
 * server, and reading the clock is the correct way to answer "what is overdue"
 * or "which badge has lapsed". There is no render to replay. */
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
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
  phraseText,
  pickScope,
  waitingShopFor,
  type ListingKind,
  type PublishingNote,
  type ShopSummary,
} from "@/lib/publication";
import { memberShops, quotaStatus } from "@/lib/shops/server";
import { plansForSale } from "@/lib/shops/plans";
import { categoryLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * Publier une annonce — the v3 sell flow.
 *
 * Everything the wizard needs is resolved here, server-side, because two of
 * these numbers are money and must not be a client's opinion: what publishing
 * costs in each category, and how many publications the seller already owns.
 */
/** Statuses the wizard may reopen: what the draft route accepts as editable. */
const REOPENABLE = ["draft", "rejected", "pending_payment"];

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  // `?draft=<id>`: that annonce — a draft among several, one sent back for
  // correction, or a live one the seller reopened to edit. Links have pointed
  // here for a while (« Modifier l'annonce » at checkout) while the page only
  // ever loaded the newest draft.
  const { draft: draftParam } = await searchParams;
  const wanted = draftParam && /^[0-9a-f-]{36}$/i.test(draftParam) ? draftParam : null;
  const locale = await getLocale();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/annonces/nouvelle`)}`);
  }

  const t = await getTranslations("publish");
  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[13px] text-muted">{t("unavailable")}</p>
      </main>
    );
  }

  const [catRes, prodRes, creditRes, profRes, draftRes] = await Promise.all([
    admin
      .from("categories")
      .select("id, parent_id, slug, label_fr, label_ar, kind, sort_order")
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
    loadDraft(admin, user!.id, wanted),
  ]);

  type CatRow = {
    id: string; parent_id: string | null; slug: string;
    label_fr: string; label_ar: string | null; kind: string; sort_order: number;
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
      label: categoryLabel(c, locale),
      kind: c.kind === "part" ? "part" : "vehicle",
      groupLabel: categoryLabel(parents.find((p) => p.id === c.parent_id), locale) || t("otherGroup"),
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
      // Worded here, in the page's language: the wizard only shows it.
      const note = describePublishing({ kind, personal, shop });
      return { personal, note: { ...note, note: note.phrase ? phraseText(note.phrase, locale) : null } };
    }),
  );
  const publishing = { vehicle: notes[0].note, part: notes[1].note } as Record<ListingKind, PublishingNote>;

  // The cheapest shop plan on sale, for the « open a shop » button a seller
  // at the limit gets. Only read when a limit is actually reached.
  let cheapestPlan: { price: number; days: number } | null = null;
  if (publishing.vehicle.blocked || publishing.part.blocked) {
    const plans = await plansForSale(admin);
    const cheapest = plans.reduce<(typeof plans)[number] | null>(
      (min, p) => (min === null || p.price < min.price ? p : min),
      null,
    );
    cheapestPlan = cheapest ? { price: cheapest.price, days: cheapest.durationDays } : null;
  }
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
      cheapestPlan={cheapestPlan}
      waitingShops={{
        vehicle: shopName(waitingShopFor(shops, "vehicle")),
        part: shopName(waitingShopFor(shops, "part")),
      }}
      rentalVehicles={(() => {
        const s = pickScope(shops, "vehicle");
        return !("kind" in s) && s.listingType === "location_auto";
      })()}
      defaultContactName={(profRes.data?.full_name as string | null) ?? ""}
      defaultContactPhone={(profRes.data?.phone as string | null) ?? ""}
      initialDraft={(draftRes.data as unknown as InitialDraft | null) ?? null}
      locale={locale}
    />
  );
}

/** What the limit button needs to know of an unpaid shop: what to call it. */
const shopName = (s: ShopSummary | null) => (s ? { name: s.name } : null);

const DRAFT_SELECT = `id, category_id, title, description, price, price_on_request, negotiable,
  condition, governorate, attributes, contact_name, contact_phone, updated_at,
  photos:listing_photos (storage_path, sort_order),
  fitments:listing_fitments (make, model, year_from, year_to)`;

/**
 * The annonce the wizard opens: the one asked for, when it is this seller's
 * and still editable, else the newest draft they left behind.
 */
async function loadDraft(
  admin: NonNullable<ReturnType<typeof getServiceSupabase>>,
  sellerId: string,
  wanted: string | null,
) {
  if (wanted) {
    const asked = await admin
      .from("listings")
      .select(DRAFT_SELECT)
      .eq("id", wanted)
      .eq("seller_id", sellerId)
      .in("status", REOPENABLE)
      .maybeSingle();
    if (asked.data) return asked;
  }
  return admin
    .from("listings")
    .select(DRAFT_SELECT)
    .eq("seller_id", sellerId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
