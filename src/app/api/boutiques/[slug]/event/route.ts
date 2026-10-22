import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { revealIpHash } from "@/lib/http/revealLimit";

/**
 * POST /api/boutiques/[slug]/event — { kind: "shop_view" | "whatsapp_click" }:
 * a visitor opened the storefront, or tapped its WhatsApp button. Counted for
 * the shop's statistics (0193).
 *
 * The body may arrive as text/plain: the WhatsApp tap is a sendBeacon, and a
 * beacon with a JSON content type is refused by some browsers.
 *
 * The database keeps one row per visitor, per thing, per day, and never counts
 * the shop's own members — so this route can be called freely. It only keeps a
 * crawler from filling the table, and answers 200 whatever happens: a missed
 * count is not the visitor's problem. The visitor is the same key as an
 * annonce's views: a user id, or the salted IP hash — never the address.
 */

const KINDS = new Set(["shop_view", "whatsapp_click"]);
const MAX_EVENTS_PER_IP_PER_HOUR = 200;

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const { slug } = await ctx.params;
  let kind = "";
  try {
    kind = String((JSON.parse(await req.text()) as { kind?: unknown }).kind ?? "");
  } catch {
    /* not JSON */
  }
  if (!KINDS.has(kind)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = getServiceSupabase();
  if (!admin) return ok();

  const ipHash = revealIpHash(req);
  const { data: over } = await admin.rpc("check_rate_limit", {
    p_key: `shop_event:${ipHash}`,
    p_max: MAX_EVENTS_PER_IP_PER_HOUR,
    p_window_secs: 3600,
  });
  if (over === true) return ok();

  const { data: shop } = await admin.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  if (!shop || shop.status !== "active") return ok();

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  await admin.rpc("record_shop_event", {
    p_shop: shop.id,
    p_listing: null,
    p_kind: kind,
    p_viewer_key: user ? `u:${user.id}` : `a:${ipHash}`,
    p_user: user?.id ?? null,
  });
  return ok();
}
