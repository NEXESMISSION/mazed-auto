import { describe, it, expect } from "vitest";
import {
  decidePublication,
  describePublishing,
  localizeRefusal,
  phraseText,
  pickScope,
  publicationErrorFromDb,
  quotaMessage,
  quotaPhrase,
  shopForPersonalDraft,
  waitingShopFor,
  type QuotaStatus,
  type ShopSummary,
} from "./publication";

/**
 * The publication rules decide whether a seller pays, and whether an annonce
 * may go live at all. The database enforces the limit regardless (0189); these
 * lock what the seller is TOLD, and which scope an annonce lands in — the part
 * the database cannot know.
 */

const personal = (over: Partial<QuotaStatus> = {}): QuotaStatus => ({
  scope: "personal", bucket: "vehicles", limit: 1, used: 0, remaining: 1, free: true, ...over,
});
const shopQuota = (over: Partial<QuotaStatus> = {}): QuotaStatus => ({
  scope: "shop", bucket: "vehicles", limit: 120, used: 22, remaining: 98,
  has_subscription: true, subscription_ends_at: "2027-01-19T00:00:00Z", ...over,
});
const dealer: ShopSummary = {
  id: "s-dealer", name: "Auto Deal · Tunis", slug: "auto-deal-tunis",
  status: "active", activityType: "vente_auto",
};
const partsShop: ShopSummary = {
  id: "s-parts", name: "Pièces Sfax", slug: "pieces-sfax", status: "active", activityType: "pieces_auto",
};
const rental: ShopSummary = {
  id: "s-rent", name: "Loc Sousse", slug: "loc-sousse", status: "active", activityType: "location_auto",
};

describe("decidePublication — personal annonces (D-P1)", () => {
  it("publishes the first car for free", () => {
    expect(decidePublication({ shopId: null, shop: null, quota: personal() }))
      .toEqual({ kind: "personal_free" });
  });

  it("refuses a second live car, and says why", () => {
    const d = decidePublication({ shopId: null, shop: null, quota: personal({ used: 1, remaining: 0 }) });
    expect(d).toMatchObject({ kind: "refused", status: 409, error: "quota_exceeded" });
    expect((d as { detail: string }).detail).toContain("un véhicule en ligne");
    expect((d as { detail: string }).detail).toContain("boutique professionnelle");
  });

  it("falls back to the per-annonce fee when the free switch is off", () => {
    expect(decidePublication({ shopId: null, shop: null, quota: personal({ free: false }) }))
      .toEqual({ kind: "legacy_fee" });
  });

  it("never lets the fee path buy past the limit", () => {
    const d = decidePublication({
      shopId: null, shop: null, quota: personal({ free: false, used: 1, remaining: 0 }),
    });
    expect(d).toMatchObject({ kind: "refused", error: "quota_exceeded" });
  });
});

describe("decidePublication — shop annonces", () => {
  it("is covered by a current subscription", () => {
    expect(decidePublication({ shopId: dealer.id, shop: dealer, quota: shopQuota() }))
      .toEqual({ kind: "subscription", shopId: dealer.id });
  });

  it("refuses without a current subscription", () => {
    const d = decidePublication({
      shopId: dealer.id, shop: dealer, quota: shopQuota({ has_subscription: false, limit: 0, remaining: 0 }),
    });
    expect(d).toMatchObject({ kind: "refused", error: "subscription_required" });
  });

  it("refuses for a shop that is not active, whatever its subscription", () => {
    const d = decidePublication({
      shopId: dealer.id, shop: { ...dealer, status: "suspended" }, quota: shopQuota(),
    });
    expect(d).toMatchObject({ kind: "refused", error: "shop_not_active" });
  });

  it("refuses past the plan's limit with the shop's sentence, not a person's", () => {
    const d = decidePublication({
      shopId: dealer.id, shop: dealer, quota: shopQuota({ limit: 10, used: 10, remaining: 0 }),
    });
    expect(d).toMatchObject({ kind: "refused", error: "quota_exceeded" });
    expect((d as { detail: string }).detail).toContain("10 véhicules");
    expect((d as { detail: string }).detail).toContain("formule supérieure");
  });
});

describe("pickScope — which scope a new annonce is filed under", () => {
  it("files a dealer's car under their shop", () => {
    expect(pickScope([dealer], "vehicle")).toEqual({ shopId: dealer.id, listingType: "vente_auto" });
  });

  it("keeps a dealer's spare part personal: a car shop publishes vehicles", () => {
    expect(pickScope([dealer], "part")).toEqual({ shopId: null, listingType: "pieces_auto" });
  });

  it("files a part under a parts shop", () => {
    expect(pickScope([dealer, partsShop], "part")).toEqual({ shopId: partsShop.id, listingType: "pieces_auto" });
  });

  it("honours an explicit choice to publish personally", () => {
    expect(pickScope([dealer], "vehicle", { as: "personal" })).toEqual({ shopId: null, listingType: "vente_auto" });
  });

  it("ignores a shop that is not active", () => {
    expect(pickScope([{ ...dealer, status: "pending_review" }], "vehicle"))
      .toEqual({ shopId: null, listingType: "vente_auto" });
  });

  it("refuses a shop the person does not belong to", () => {
    expect(pickScope([dealer], "vehicle", { shopId: "someone-elses" }))
      .toMatchObject({ kind: "refused", error: "not_shop_member" });
  });

  it("refuses a part filed under a car shop by name", () => {
    expect(pickScope([dealer], "part", { shopId: dealer.id }))
      .toMatchObject({ kind: "refused", error: "shop_activity_mismatch" });
  });

  it("files a rental under the rental shop when asked for one", () => {
    expect(pickScope([dealer, rental], "vehicle", { listingType: "location_auto" }))
      .toEqual({ shopId: rental.id, listingType: "location_auto" });
  });

  it("refuses a rental from someone without a rental shop", () => {
    expect(pickScope([], "vehicle", { listingType: "location_auto" }))
      .toMatchObject({ kind: "refused", error: "rental_requires_shop" });
    expect(pickScope([dealer], "vehicle", { as: "personal", listingType: "location_auto" }))
      .toMatchObject({ kind: "refused", error: "rental_requires_shop" });
  });
});

describe("waitingShopFor — the unpaid shop the limit button activates", () => {
  it("finds a seller's car shop still waiting for its subscription", () => {
    const draft = { ...dealer, status: "draft" };
    expect(waitingShopFor([draft], "vehicle")).toBe(draft);
    expect(waitingShopFor([{ ...dealer, status: "pending_review" }], "vehicle")?.id).toBe(dealer.id);
  });

  it("matches the kind: a parts shop for a part, not for a car", () => {
    const parts = { ...partsShop, status: "draft" };
    expect(waitingShopFor([parts], "part")).toBe(parts);
    expect(waitingShopFor([parts], "vehicle")).toBeNull();
  });

  it("stays out of the way when an active shop already takes the annonce", () => {
    expect(waitingShopFor([dealer, { ...rental, status: "draft" }], "vehicle")).toBeNull();
  });

  it("ignores a shop that cannot be paid for", () => {
    expect(waitingShopFor([{ ...dealer, status: "suspended" }], "vehicle")).toBeNull();
    expect(waitingShopFor([{ ...dealer, status: "rejected" }], "vehicle")).toBeNull();
    expect(waitingShopFor([], "vehicle")).toBeNull();
  });
});

describe("shopForPersonalDraft — a draft saved at the personal limit", () => {
  it("moves a car draft into the dealer shop opened since", () => {
    expect(shopForPersonalDraft([dealer], "vente_auto")).toBe(dealer);
  });

  it("moves a part draft into a parts shop", () => {
    expect(shopForPersonalDraft([dealer, partsShop], "pieces_auto")).toBe(partsShop);
  });

  it("never turns a sale into a rental by landing in a rental shop", () => {
    expect(shopForPersonalDraft([rental], "vente_auto")).toBeNull();
  });

  it("ignores a shop that is not active yet", () => {
    expect(shopForPersonalDraft([{ ...dealer, status: "pending" }], "vente_auto")).toBeNull();
  });

  it("has nowhere to go without a shop", () => {
    expect(shopForPersonalDraft([], "vente_auto")).toBeNull();
  });
});

describe("describePublishing — what the wizard says", () => {
  it("tells a person their car is free, one at a time", () => {
    expect(describePublishing({ kind: "vehicle", personal: personal(), shop: null }))
      .toMatchObject({ free: true, blocked: false, note: "Gratuit pour un particulier : 1 véhicule en ligne à la fois." });
  });

  it("counts down parts once some are live", () => {
    const d = describePublishing({
      kind: "part",
      personal: personal({ bucket: "parts", limit: 5, used: 2, remaining: 3 }),
      shop: null,
    });
    expect(d.note).toBe("Gratuit pour un particulier : jusqu'à 5 pièces en ligne à la fois (encore 3).");
  });

  it("warns before the form is filled when the limit is already reached", () => {
    const d = describePublishing({ kind: "vehicle", personal: personal({ used: 1, remaining: 0 }), shop: null });
    expect(d.blocked).toBe(true);
    expect(d.note).toContain("c'est la limite pour un particulier");
  });

  it("shows a shop its usage against its plan", () => {
    const d = describePublishing({
      kind: "vehicle", personal: personal(), shop: { summary: dealer, quota: shopQuota() },
    });
    expect(d).toMatchObject({
      free: true,
      blocked: false,
      note: "Inclus dans l'abonnement de « Auto Deal · Tunis » — 22 / 120 véhicules en ligne.",
    });
  });

  it("warns a shop with no current subscription", () => {
    const d = describePublishing({
      kind: "vehicle", personal: personal(),
      shop: { summary: dealer, quota: shopQuota({ has_subscription: false, limit: 0, remaining: 0 }) },
    });
    expect(d).toMatchObject({ free: false, blocked: true });
  });

  it("says nothing extra on the fee path while there is room", () => {
    expect(describePublishing({ kind: "vehicle", personal: personal({ free: false }), shop: null }))
      .toEqual({ free: false, blocked: false, note: null, phrase: null });
  });
});

describe("publicationErrorFromDb — the trigger's refusal, in words", () => {
  it.each([
    ["quota_exceeded", 409, "quota_exceeded"],
    ["subscription_required", 409, "subscription_required"],
    ["shop_not_active", 409, "shop_not_active"],
    ["seller_banned", 403, "account_suspended"],
    ["rental_requires_shop", 400, "rental_requires_shop"],
    ["shop_activity_mismatch", 400, "shop_activity_mismatch"],
    ["not_shop_member", 403, "not_shop_member"],
  ])("maps %s", (raised, status, error) => {
    expect(publicationErrorFromDb({ message: raised })).toMatchObject({ status, error });
  });

  it("leaves anything else alone", () => {
    expect(publicationErrorFromDb({ message: "duplicate key value" })).toBeNull();
    expect(publicationErrorFromDb(null)).toBeNull();
  });
});

describe("quotaMessage", () => {
  it("speaks of parts in the plural", () => {
    expect(quotaMessage({ scope: "personal", bucket: "parts", limit: 5 }))
      .toContain("5 pièces en ligne");
  });
});

describe("the same sentences in Arabic", () => {
  it("words a phrase, its counts included, in Arabic", () => {
    const text = phraseText(quotaPhrase({ scope: "personal", bucket: "parts", limit: 5 }), "ar");
    expect(text).toMatch(/\p{Script=Arabic}/u);
    expect(text).toContain("5 قطع");
    expect(phraseText(quotaPhrase({ scope: "shop", bucket: "vehicles", limit: 1 }), "ar")).toContain("مركبة واحدة");
  });

  it("re-words a refusal's detail for an API response, keeping its code", () => {
    const d = decidePublication({ shopId: null, shop: null, quota: personal({ used: 1, remaining: 0 }) });
    if (d.kind !== "refused") throw new Error("expected a refusal");
    const ar = localizeRefusal(d, "ar");
    expect(ar).toMatchObject({ status: 409, error: "quota_exceeded" });
    expect(ar.detail).toMatch(/\p{Script=Arabic}/u);
    expect(localizeRefusal(d, "fr").detail).toBe(d.detail);
  });

  it("names the shop in the wizard's note", () => {
    const d = describePublishing({
      kind: "vehicle", personal: personal(), shop: { summary: dealer, quota: shopQuota() },
    });
    expect(phraseText(d.phrase!, "ar")).toContain("Auto Deal · Tunis");
  });
});
