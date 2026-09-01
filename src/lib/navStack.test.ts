import { describe, it, expect } from "vitest";
import { resolveBack, pushPath, isTransient, parentPath, MAX_STACK } from "./navStack";

describe("isTransient", () => {
  it("flags gate routes that redirect you straight back out", () => {
    for (const p of [
      "/login",
      "/signup",
      "/forgot-password",
      "/kyc",
      "/kyc/id-front",
      "/payment/checkout",
      "/payment/success",
      "/inspectors/book",
      "/account/inspections",
      "/admin/inspectors",
    ]) {
      expect(isTransient(p), p).toBe(true);
    }
  });

  it("leaves ordinary destinations alone", () => {
    for (const p of [
      "/",
      "/properties",
      "/auctions",
      "/auctions/abc-123",
      "/account",
      "/account/payments",
      "/sell",
      "/watchlist",
      "/how-it-works",
    ]) {
      expect(isTransient(p), p).toBe(false);
    }
  });

  it("does not match a route that merely shares a prefix", () => {
    // "/logins" and "/paymentsomething" are not "/login" / "/payment".
    expect(isTransient("/logins")).toBe(false);
    expect(isTransient("/payments-report")).toBe(false);
  });
});

describe("resolveBack", () => {
  it("returns the previous page, not home", () => {
    const stack = ["/", "/properties", "/auctions/abc"];
    expect(resolveBack(stack, "/auctions/abc").target).toBe("/properties");
  });

  it("backing out of /login skips the auth-gated page that sent you there", () => {
    // The loop: /account/payments bounced the signed-out user to /login.
    // Returning to it re-triggers the gate → /login again, forever.
    const stack = ["/", "/properties", "/account/payments", "/login"];
    expect(resolveBack(stack, "/login").target).toBe("/properties");
  });

  it("still allows auth-gated pages as back targets for a signed-in user", () => {
    // Same page, but we are NOT backing out of a sign-in surface, so there is
    // no reason to think the session is missing. Skipping it here would break
    // ordinary navigation for everyone who is logged in.
    const stack = ["/", "/account", "/account/payments", "/auctions/abc"];
    expect(resolveBack(stack, "/auctions/abc").target).toBe("/account/payments");
  });

  it("skips a whole run of consecutive gate routes", () => {
    const stack = ["/auctions/abc", "/kyc/start", "/kyc/id-front", "/login"];
    expect(resolveBack(stack, "/login").target).toBe("/auctions/abc");
  });

  it("truncates the stack so repeated taps keep walking backwards", () => {
    // Regression guard for the A→B→C→B→C bounce: after going back to B the
    // stack must no longer contain C, or the next tap returns to C.
    const stack = ["/a", "/b", "/c"];
    const first = resolveBack(stack, "/c");
    expect(first.target).toBe("/b");
    expect(first.nextStack).toEqual(["/a", "/b"]);

    const second = resolveBack(first.nextStack, "/b");
    expect(second.target).toBe("/a");
    expect(second.nextStack).toEqual(["/a"]);
  });

  it("skips repeats of the page you are already on", () => {
    // A → B → A: back from A is B, never A itself.
    const stack = ["/a", "/b", "/a"];
    expect(resolveBack(stack, "/a").target).toBe("/b");
  });

  it("falls back to the hierarchical parent when history is unusable", () => {
    // Deep link straight into a bid screen — nothing behind it.
    expect(resolveBack([], "/auctions/abc/bid").target).toBe("/auctions/abc");
    expect(resolveBack(["/login"], "/account/payments").target).toBe("/account");
  });

  it("falls back to home only when there is no parent either", () => {
    expect(resolveBack([], "/how-it-works").target).toBe("/");
    expect(resolveBack([], "/").target).toBe("/");
  });

  it("never returns the current path", () => {
    const stack = ["/x", "/x", "/x"];
    expect(resolveBack(stack, "/x").target).not.toBe("/x");
  });
});

describe("parentPath", () => {
  it("sends a bid screen to its own auction, not the catalogue", () => {
    expect(parentPath("/auctions/abc-123/bid")).toBe("/auctions/abc-123");
  });

  it("maps known sections to real pages", () => {
    expect(parentPath("/auctions/abc")).toBe("/auctions");
    expect(parentPath("/account/settings")).toBe("/account");
    expect(parentPath("/admin/payouts")).toBe("/admin");
    expect(parentPath("/sell/abc")).toBe("/sell");
  });

  it("returns null rather than guessing a route that may not exist", () => {
    expect(parentPath("/how-it-works")).toBeNull();
    expect(parentPath("/")).toBeNull();
  });
});

describe("pushPath", () => {
  it("appends new paths", () => {
    expect(pushPath(["/a"], "/b")).toEqual(["/a", "/b"]);
  });

  it("ignores a repeat of the head — that is what a back nav looks like", () => {
    // Without this the tracker would undo resolveBack's truncation and
    // reintroduce the ping-pong.
    expect(pushPath(["/a", "/b"], "/b")).toEqual(["/a", "/b"]);
  });

  it("keeps a legitimate A → B → A revisit", () => {
    expect(pushPath(["/a", "/b"], "/a")).toEqual(["/a", "/b", "/a"]);
  });

  it("bounds the stack", () => {
    let s: string[] = [];
    for (let i = 0; i < MAX_STACK + 10; i++) s = pushPath(s, `/p${i}`);
    expect(s.length).toBe(MAX_STACK);
    expect(s[s.length - 1]).toBe(`/p${MAX_STACK + 9}`);
  });
});
