import { describe, it, expect } from "vitest";
import { activeTabFor, TAB_HREFS, TAB_MATCHERS, type TabId } from "./tabs";

describe("activeTabFor", () => {
  it("lights every tab on its own destination", () => {
    // The invariant the bar actually broke: "Activité" linked to
    // /account/listings while matching /account/activity, so tapping it lit
    // nothing. A tab that does not recognise where it sends you is a bug by
    // construction, whatever the paths happen to be.
    for (const [id, href] of Object.entries(TAB_HREFS) as [TabId, string][]) {
      expect(activeTabFor(href), `${id} → ${href}`).toBe(id);
    }
  });

  it("never lights two tabs for the same path", () => {
    // The other half of the same bug: Compte's `startsWith("/account/")`
    // swallowed /account/listings, so even once Activité matched it, both
    // would have been gold.
    const paths = [
      "/", "/annonces", "/annonces/abc", "/annonces/nouvelle",
      "/account", "/account/listings", "/account/favoris", "/watchlist",
      "/account/settings", "/account/notifications", "/login", "/signup",
      "/payment/123", "/admin/annonces", "/sell", "/properties/9", "/auctions/9",
    ];
    for (const p of paths) {
      const hits = TAB_MATCHERS.filter((t) => t.match(p)).map((t) => t.id);
      expect(hits.length, `${p} lit ${hits.join(" + ") || "nothing"}`).toBe(1);
    }
  });

  it("gives the fourth tab to Favoris, not Compte", () => {
    // "Activité" held this slot until v3 left it with nothing to show. The
    // failure mode is the same either way: Compte's `startsWith("/account/")`
    // swallowing whatever sits under it.
    expect(activeTabFor("/account/favoris")).toBe("favorites");
    expect(activeTabFor("/watchlist")).toBe("favorites");
  });

  it("keeps the rest of the account section under Compte", () => {
    expect(activeTabFor("/account")).toBe("account");
    expect(activeTabFor("/account/listings")).toBe("account");
    expect(activeTabFor("/account/settings")).toBe("account");
    expect(activeTabFor("/admin/annonces")).toBe("account");
  });

  it("does not let the catalog swallow the sell wizard", () => {
    // /annonces/nouvelle sits under /annonces; order decides this, so it is
    // worth pinning rather than trusting the array stays as written.
    expect(activeTabFor("/annonces/nouvelle")).toBe("sell");
    expect(activeTabFor("/annonces/some-listing-id")).toBe("browse");
  });

  it("returns null rather than guessing for a path no tab owns", () => {
    expect(activeTabFor("/a-propos")).toBeNull();
  });
});
