import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { socialGate } from "@/lib/social/gate";
import { isSocialCryptoConfigured, OAUTH_NONCE_COOKIE, signState } from "@/lib/social/crypto";
import { metaConfig, oauthUrl } from "@/lib/social/meta";
import { siteUrl } from "@/lib/siteUrl";

/**
 * GET /api/pro/social/meta/connect?shop=<id> — start connecting the shop's
 * Facebook Pages (and the Instagram accounts linked to them).
 *
 * Owner or manager only. The `state` sent to Meta is signed and names the shop
 * and the person; its nonce also sits in an httpOnly cookie, so the callback
 * can only complete in the browser that started it, for the shop it started
 * for. Ten minutes to finish.
 */
export async function GET(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get("shop") ?? "";
  const gate = await requireShopRole(req, shopId, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  if (!(await socialGate(gate.admin)).visible) return NextResponse.json({ error: "not_available" }, { status: 404 });

  const cfg = metaConfig();
  if (!cfg || !isSocialCryptoConfigured()) {
    return NextResponse.redirect(new URL(`/fr/pro/dashboard/marketing?social_error=not_configured`, req.url), 303);
  }

  const nonce = randomBytes(16).toString("base64url");
  const state = signState({ shopId, userId: gate.user.id, nonce, exp: Date.now() + 10 * 60_000 });
  const res = NextResponse.redirect(oauthUrl(cfg, `${siteUrl()}/api/pro/social/meta/callback`, state), 303);
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/pro/social/meta",
    maxAge: 600,
  });
  return res;
}
