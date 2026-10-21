/**
 * Who pays for a publication, and whether it may happen at all.
 *
 * Shared by /api/annonces (which scope a new annonce is filed under),
 * /api/annonces/[id]/submit and /renew (how it is paid for), and the sell
 * wizard (what the seller is told before they press the button). Pure, so the
 * rules can be tested without a database.
 *
 * The database has the last word: `_listings_quota` (migration 0189) refuses
 * an annonce going live past its limit whoever writes it. These functions only
 * decide earlier, so the seller gets a sentence instead of an error code — and
 * `publicationErrorFromDb` turns the trigger's refusal into the same sentence
 * when a race gets there first.
 *
 * The rules (brief + D-P1):
 *   • a shop annonce is covered by the shop's current subscription, within the
 *     limit of the shop's activity;
 *   • a personal annonce is free, 1 vehicle and 5 parts live at a time —
 *     unless `personal_limits.free` is switched off, in which case the old
 *     per-annonce fee applies (limits still hold);
 *   • nothing is ever "free" past its limit.
 */

export type ListingKind = "vehicle" | "part";
export type ListingType = "vente_auto" | "location_auto" | "pieces_auto";

/** What `listing_quota_status()` returns. */
export type QuotaStatus = {
  scope: "personal" | "shop";
  bucket: "vehicles" | "parts";
  limit: number;
  used: number;
  remaining: number;
  /** Personal only: is a personal annonce published for nothing. */
  free?: boolean;
  /** Shop only: is there a period the shop may publish under right now. */
  has_subscription?: boolean;
  subscription_ends_at?: string | null;
};

export type ShopSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  activityType: ListingType;
};

export type Refusal = { status: number; error: string; detail: string };

export type PublicationDecision =
  | { kind: "subscription"; shopId: string }
  | { kind: "personal_free" }
  | { kind: "legacy_fee" }
  | ({ kind: "refused" } & Refusal);

const BUCKET_WORD = {
  vehicles: { one: "véhicule", many: "véhicules" },
  parts: { one: "pièce", many: "pièces" },
} as const;

function count(n: number, bucket: QuotaStatus["bucket"]): string {
  const w = BUCKET_WORD[bucket];
  return `${n} ${n > 1 ? w.many : w.one}`;
}

/** The sentence a seller reads when an annonce cannot go live: limit reached. */
export function quotaMessage(q: Pick<QuotaStatus, "scope" | "bucket" | "limit">): string {
  if (q.scope === "shop") {
    return (
      `Votre abonnement permet ${count(q.limit, q.bucket)} en ligne à la fois, `
      + "et la limite est atteinte. Retirez une annonce ou passez à une formule supérieure."
    );
  }
  const what = q.limit === 1 && q.bucket === "vehicles"
    ? "un véhicule en ligne"
    : `${count(q.limit, q.bucket)} en ligne`;
  return (
    `Vous avez déjà ${what} : c'est la limite pour un particulier. `
    + "Retirez une annonce, ou ouvrez une boutique professionnelle pour en publier davantage."
  );
}

/** The bucket an annonce of this kind draws on. */
export function listingTypeFor(kind: ListingKind): ListingType {
  return kind === "part" ? "pieces_auto" : "vente_auto";
}

/**
 * Which scope a new (or re-scoped) annonce is filed under.
 *
 * `as: "personal"` always wins. An explicit `shopId` must be one the person
 * belongs to. Otherwise a member of an ACTIVE shop whose activity fits the
 * annonce publishes it as the shop — a dealer publishes as a dealer — and
 * everyone else publishes personally.
 */
export function pickScope(
  shops: ShopSummary[],
  kind: ListingKind,
  requested: { as?: unknown; shopId?: unknown; listingType?: unknown } = {},
): { shopId: string | null; listingType: ListingType } | ({ kind: "refused" } & Refusal) {
  const wantedType =
    requested.listingType === "location_auto" || requested.listingType === "vente_auto"
      ? (requested.listingType as ListingType)
      : null;

  const fits = (s: ShopSummary) =>
    kind === "part" ? s.activityType === "pieces_auto" : s.activityType !== "pieces_auto";

  if (requested.as === "personal") {
    if (kind === "vehicle" && wantedType === "location_auto") {
      return refused(400, "rental_requires_shop",
        "La location de véhicules se publie depuis une boutique de location.");
    }
    return { shopId: null, listingType: listingTypeFor(kind) };
  }

  if (typeof requested.shopId === "string" && requested.shopId) {
    const shop = shops.find((s) => s.id === requested.shopId);
    if (!shop) {
      return refused(403, "not_shop_member", "Vous ne faites pas partie de cette boutique.");
    }
    if (!fits(shop)) {
      return refused(400, "shop_activity_mismatch", activityMismatch(shop));
    }
    return { shopId: shop.id, listingType: shop.activityType };
  }

  const active = shops.filter((s) => s.status === "active" && fits(s));
  const chosen =
    (wantedType && active.find((s) => s.activityType === wantedType))
    ?? active.find((s) => s.activityType === "vente_auto")
    ?? active.find((s) => s.activityType === "pieces_auto")
    ?? active.find((s) => s.activityType === "location_auto")
    ?? null;

  if (chosen) return { shopId: chosen.id, listingType: chosen.activityType };
  if (kind === "vehicle" && wantedType === "location_auto") {
    return refused(400, "rental_requires_shop",
      "La location de véhicules se publie depuis une boutique de location.");
  }
  return { shopId: null, listingType: listingTypeFor(kind) };
}

/** How an annonce that is ready to go out gets paid for — or why it cannot. */
export function decidePublication(input: {
  shopId: string | null;
  shop: ShopSummary | null;
  quota: QuotaStatus;
}): PublicationDecision {
  const { shopId, shop, quota } = input;

  if (shopId) {
    if (!shop || shop.status !== "active") {
      return refused(409, "shop_not_active",
        "Votre boutique n'est pas active : ses annonces ne peuvent pas être mises en ligne pour l'instant.");
    }
    if (!quota.has_subscription) {
      return refused(409, "subscription_required",
        "Votre boutique n'a pas d'abonnement en cours. Renouvelez-le pour mettre des annonces en ligne.");
    }
    if (quota.remaining <= 0) return refused(409, "quota_exceeded", quotaMessage(quota));
    return { kind: "subscription", shopId };
  }

  if (quota.remaining <= 0) return refused(409, "quota_exceeded", quotaMessage(quota));
  return quota.free === false ? { kind: "legacy_fee" } : { kind: "personal_free" };
}

export type PublishingNote = {
  /** The seller will not be asked to pay. */
  free: boolean;
  /** Submitting will be refused as things stand — show the note as a warning. */
  blocked: boolean;
  note: string | null;
};

/**
 * What the sell wizard says about publishing an annonce of this kind, before
 * anything is sent.
 */
export function describePublishing(input: {
  kind: ListingKind;
  personal: QuotaStatus;
  shop: { summary: ShopSummary; quota: QuotaStatus } | null;
}): PublishingNote {
  const { personal, shop } = input;

  if (shop) {
    const q = shop.quota;
    if (!q.has_subscription) {
      return {
        free: false,
        blocked: true,
        note: `« ${shop.summary.name} » n'a pas d'abonnement en cours : l'annonce sera enregistrée mais ne pourra pas être mise en ligne.`,
      };
    }
    if (q.remaining <= 0) return { free: true, blocked: true, note: quotaMessage(q) };
    return {
      free: true,
      blocked: false,
      note: `Inclus dans l'abonnement de « ${shop.summary.name} » — ${q.used} / ${count(q.limit, q.bucket)} en ligne.`,
    };
  }

  if (personal.remaining <= 0) {
    return { free: personal.free !== false, blocked: true, note: quotaMessage(personal) };
  }
  if (personal.free === false) return { free: false, blocked: false, note: null };
  const allowance = personal.limit === 1 && personal.bucket === "vehicles"
    ? "1 véhicule en ligne à la fois"
    : `jusqu'à ${count(personal.limit, personal.bucket)} en ligne à la fois`
      + (personal.used > 0 ? ` (encore ${personal.remaining})` : "");
  return { free: true, blocked: false, note: `Gratuit pour un particulier : ${allowance}.` };
}

/**
 * The database refused a write to `listings`: turn its exception into what
 * the seller should read. Null when the error is not one of these rules.
 */
export function publicationErrorFromDb(err: { message?: string } | null | undefined): Refusal | null {
  const m = err?.message ?? "";
  if (m.includes("quota_exceeded")) {
    return { status: 409, error: "quota_exceeded", detail: "La limite d'annonces en ligne est atteinte." };
  }
  if (m.includes("subscription_required")) {
    return { status: 409, error: "subscription_required",
      detail: "Votre boutique n'a pas d'abonnement en cours. Renouvelez-le pour mettre des annonces en ligne." };
  }
  if (m.includes("shop_not_active")) {
    return { status: 409, error: "shop_not_active",
      detail: "Votre boutique n'est pas active : ses annonces ne peuvent pas être mises en ligne pour l'instant." };
  }
  if (m.includes("seller_banned")) {
    return { status: 403, error: "account_suspended",
      detail: "Votre compte est suspendu : vous ne pouvez pas publier d'annonce." };
  }
  if (m.includes("rental_requires_shop")) {
    return { status: 400, error: "rental_requires_shop",
      detail: "La location de véhicules se publie depuis une boutique de location." };
  }
  if (m.includes("shop_activity_mismatch")) {
    return { status: 400, error: "shop_activity_mismatch",
      detail: "Cette catégorie ne correspond pas à l'activité de votre boutique." };
  }
  if (m.includes("not_shop_member")) {
    return { status: 403, error: "not_shop_member", detail: "Vous ne faites pas partie de cette boutique." };
  }
  return null;
}

function activityMismatch(shop: ShopSummary): string {
  const what = shop.activityType === "pieces_auto"
    ? "des pièces"
    : shop.activityType === "location_auto"
      ? "des véhicules en location"
      : "des véhicules à vendre";
  return `« ${shop.name} » publie ${what} : cette catégorie n'y correspond pas.`;
}

function refused(status: number, error: string, detail: string): { kind: "refused" } & Refusal {
  return { kind: "refused", status, error, detail };
}
