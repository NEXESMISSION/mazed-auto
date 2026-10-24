import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { CAN_EDIT_SHOP, memberRole } from "@/lib/shops/server";
import { encryptToken, OAUTH_NONCE_COOKIE, readState } from "@/lib/social/crypto";
import { listPages, MetaError, metaConfig, userTokenFromCode } from "@/lib/social/meta";
import { siteUrl } from "@/lib/siteUrl";
import { logAction } from "@/lib/activity";
import { log } from "@/lib/log";

/**
 * GET /api/pro/social/meta/callback — Meta sends the person back here.
 *
 * This arrives from facebook.com, so it cannot rely on the same-origin check
 * the other routes use. Instead: the signed state must hold, name this signed-
 * in person, and match the nonce cookie set by /connect in this browser; and
 * the person must still manage the shop. Then the code is exchanged for a
 * long-lived token, the Pages are listed, and each Page — with the Instagram
 * professional account linked to it — is recorded for the shop, its token
 * encrypted. Reconnecting refreshes the same rows.
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/fr/pro/dashboard/marketing?${q}`, req.url), 303);
    res.cookies.set(OAUTH_NONCE_COOKIE, "", { path: "/api/pro/social/meta", maxAge: 0 });
    return res;
  };

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("social_error=denied");
  const state = readState(sp.get("state"));
  const nonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!state || !nonce || state.nonce !== nonce || !user || user.id !== state.userId) return back("social_error=state");

  const admin = getServiceSupabase();
  const cfg = metaConfig();
  if (!admin || !cfg) return back("social_error=not_configured");
  const role = await memberRole(admin, user.id, state.shopId);
  if (!role || !CAN_EDIT_SHOP.includes(role)) return back("social_error=forbidden");

  try {
    const token = await userTokenFromCode(cfg, sp.get("code") ?? "", `${siteUrl()}/api/pro/social/meta/callback`);
    const pages = await listPages(cfg, token);
    let n = 0;
    for (const p of pages) {
      const fbId = await saveAccount(admin, state.shopId, user.id, {
        network: "facebook", external_id: p.id, name: p.name, username: null, picture_url: p.picture,
        token_ciphertext: encryptToken(p.token), parent_account_id: null,
      });
      n++;
      if (p.instagram) {
        await saveAccount(admin, state.shopId, user.id, {
          network: "instagram", external_id: p.instagram.id, name: p.instagram.username ?? p.name,
          username: p.instagram.username, picture_url: p.instagram.picture,
          // Instagram is published to with the token of the Page it is linked to.
          token_ciphertext: encryptToken(p.token), parent_account_id: fbId,
        });
        n++;
      }
    }
    logAction(req, user, "social.accounts_connected", { shopId: state.shopId, count: n });
    return back(n ? `connected=${n}` : "social_error=no_pages");
  } catch (e) {
    log.scope("social").error("meta callback failed", { message: (e as Error).message, kind: e instanceof MetaError ? e.kind : null });
    return back("social_error=meta");
  }
}

type AccountFields = {
  network: "facebook" | "instagram"; external_id: string; name: string; username: string | null;
  picture_url: string | null; token_ciphertext: string; parent_account_id: string | null;
};

/** Insert, or refresh the row this shop already has for that account. */
async function saveAccount(admin: SupabaseClient, shopId: string, userId: string, a: AccountFields): Promise<string> {
  const { data: existing } = await admin
    .from("social_accounts")
    .select("id")
    .eq("shop_id", shopId)
    .eq("network", a.network)
    .eq("external_id", a.external_id)
    .maybeSingle();
  const row = { ...a, shop_id: shopId, connected_by: userId, status: "active", last_error: null, token_expires_at: null, updated_at: new Date().toISOString() };
  if (existing) {
    await admin.from("social_accounts").update(row).eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await admin.from("social_accounts").insert(row).select("id").single();
  if (error || !data) throw new Error(`account save failed: ${error?.message}`);
  return data.id as string;
}
