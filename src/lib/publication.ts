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
 *
 * Every sentence is a `Phrase` — a key under `publish.rules` in
 * messages/publish/<locale>.json and its values — so the API and the wizard can
 * word it in the reader's language with `phraseText`. `detail` / `note` keep
 * the French wording for callers that have not moved to phrases yet.
 */

import { createTranslator } from "next-intl";
import frMessages from "../../messages/publish/fr.json";
import arMessages from "../../messages/publish/ar.json";

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

/** A sentence for the seller: a key under `publish.rules`, and its values (a value may itself be a phrase). */
export type Phrase = { key: string; values?: Record<string, string | number | Phrase> };

export type Refusal = { status: number; error: string; phrase: Phrase; detail: string };

export type PublicationDecision =
  | { kind: "subscription"; shopId: string }
  | { kind: "personal_free" }
  | { kind: "legacy_fee" }
  | ({ kind: "refused" } & Refusal);

const MESSAGES = { fr: frMessages, ar: arMessages } as const;

type Translate = (key: string, values?: Record<string, string | number>) => string;

const translators = new Map<string, Translate>();

function translatorFor(locale: string): Translate {
  const l = locale === "ar" ? "ar" : "fr";
  let t = translators.get(l);
  if (!t) {
    t = createTranslator({ locale: l, messages: MESSAGES[l], namespace: "rules" }) as unknown as Translate;
    translators.set(l, t);
  }
  return t;
}

/** A phrase in `locale` (French unless "ar"). */
export function phraseText(phrase: Phrase, locale: string): string {
  const t = translatorFor(locale);
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(phrase.values ?? {})) {
    values[k] = typeof v === "object" ? phraseText(v, locale) : v;
  }
  return t(phrase.key, values);
}

/** The same refusal, its `detail` worded in `locale` — for an API response. */
export function localizeRefusal<R extends Refusal>(r: R, locale: string): R {
  return { ...r, detail: phraseText(r.phrase, locale) };
}

function count(n: number, bucket: QuotaStatus["bucket"]): Phrase {
  return { key: `count.${bucket}`, values: { n } };
}

/** The phrase a seller reads when an annonce cannot go live: limit reached. */
export function quotaPhrase(q: Pick<QuotaStatus, "scope" | "bucket" | "limit">): Phrase {
  if (q.scope === "shop") return { key: "quotaShop", values: { count: count(q.limit, q.bucket) } };
  if (q.limit === 1 && q.bucket === "vehicles") return { key: "quotaPersonalOne" };
  return { key: "quotaPersonal", values: { count: count(q.limit, q.bucket) } };
}

/** `quotaPhrase`, in French. */
export function quotaMessage(q: Pick<QuotaStatus, "scope" | "bucket" | "limit">): string {
  return phraseText(quotaPhrase(q), "fr");
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
      return refused(400, "rental_requires_shop", { key: "rentalRequiresShop" });
    }
    return { shopId: null, listingType: listingTypeFor(kind) };
  }

  if (typeof requested.shopId === "string" && requested.shopId) {
    const shop = shops.find((s) => s.id === requested.shopId);
    if (!shop) {
      return refused(403, "not_shop_member", { key: "notShopMember" });
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
    return refused(400, "rental_requires_shop", { key: "rentalRequiresShop" });
  }
  return { shopId: null, listingType: listingTypeFor(kind) };
}

/**
 * The shop a PERSONAL draft may move into when the personal limit refuses it:
 * one of the seller's active shops whose activity is exactly the draft's.
 *
 * This is the « enregistrée, mais pas mise en ligne » draft of a seller who
 * then opened a shop from the limit screen. Without it the draft stayed
 * personal for ever, still over the personal limit. Exactly the draft's
 * activity, not merely one that `fits`: a sale draft must never become a
 * rental by landing in a rental shop.
 */
export function shopForPersonalDraft(
  shops: ShopSummary[],
  listingType: ListingType,
): ShopSummary | null {
  return shops.find((s) => s.status === "active" && s.activityType === listingType) ?? null;
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
      return refused(409, "shop_not_active", { key: "shopNotActive" });
    }
    if (!quota.has_subscription) {
      return refused(409, "subscription_required", { key: "subscriptionRequired" });
    }
    if (quota.remaining <= 0) return refused(409, "quota_exceeded", quotaPhrase(quota));
    return { kind: "subscription", shopId };
  }

  if (quota.remaining <= 0) return refused(409, "quota_exceeded", quotaPhrase(quota));
  return quota.free === false ? { kind: "legacy_fee" } : { kind: "personal_free" };
}

export type PublishingNote = {
  /** The seller will not be asked to pay. */
  free: boolean;
  /** Submitting will be refused as things stand — show the note as a warning. */
  blocked: boolean;
  /** The sentence, in French; `phrase` words it in another language. */
  note: string | null;
  phrase: Phrase | null;
};

function noted(free: boolean, blocked: boolean, phrase: Phrase | null): PublishingNote {
  return { free, blocked, note: phrase ? phraseText(phrase, "fr") : null, phrase };
}

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
      return noted(false, true, { key: "noteNoSubscription", values: { shop: shop.summary.name } });
    }
    if (q.remaining <= 0) return noted(true, true, quotaPhrase(q));
    return noted(true, false, {
      key: "noteIncluded",
      values: { shop: shop.summary.name, used: q.used, count: count(q.limit, q.bucket) },
    });
  }

  if (personal.remaining <= 0) return noted(personal.free !== false, true, quotaPhrase(personal));
  if (personal.free === false) return noted(false, false, null);
  if (personal.limit === 1 && personal.bucket === "vehicles") return noted(true, false, { key: "noteFreeOne" });
  return noted(true, false, personal.used > 0
    ? { key: "noteFreeLeft", values: { count: count(personal.limit, personal.bucket), left: personal.remaining } }
    : { key: "noteFree", values: { count: count(personal.limit, personal.bucket) } });
}

/**
 * The database refused a write to `listings`: turn its exception into what
 * the seller should read. Null when the error is not one of these rules.
 */
export function publicationErrorFromDb(err: { message?: string } | null | undefined): Refusal | null {
  const m = err?.message ?? "";
  const r = (status: number, error: string, key: string): Refusal => {
    const phrase = { key };
    return { status, error, phrase, detail: phraseText(phrase, "fr") };
  };
  if (m.includes("quota_exceeded")) return r(409, "quota_exceeded", "dbQuota");
  if (m.includes("subscription_required")) return r(409, "subscription_required", "subscriptionRequired");
  if (m.includes("shop_not_active")) return r(409, "shop_not_active", "shopNotActive");
  if (m.includes("seller_banned")) return r(403, "account_suspended", "accountSuspended");
  if (m.includes("rental_requires_shop")) return r(400, "rental_requires_shop", "rentalRequiresShop");
  if (m.includes("shop_activity_mismatch")) return r(400, "shop_activity_mismatch", "categoryMismatch");
  if (m.includes("not_shop_member")) return r(403, "not_shop_member", "notShopMember");
  return null;
}

function activityMismatch(shop: ShopSummary): Phrase {
  return { key: `activityMismatch.${shop.activityType}`, values: { shop: shop.name } };
}

function refused(status: number, error: string, phrase: Phrase): { kind: "refused" } & Refusal {
  return { kind: "refused", status, error, phrase, detail: phraseText(phrase, "fr") };
}
