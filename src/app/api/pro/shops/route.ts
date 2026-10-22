import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { shopsGate } from "@/lib/shops/public";
import { slugifyShopName } from "@/lib/shops/format";
import { sanitizeShopProfile } from "@/lib/shops/profile";

/**
 * POST /api/pro/shops — open a shop: { activity_type, name, governorate, city?, phone? }.
 *
 * The shop is created as a DRAFT owned by the caller. It becomes active when
 * its first subscription period is paid (0191) — a shop that has not paid
 * cannot publish anyway. The « vérifiée » badge is a separate decision an admin
 * makes after the documents (lot 3).
 *
 * One open shop per account (0185's unique index). The same account keeps its
 * personal annonces and its personal allowance (recette 12).
 */
const ACTIVITIES = new Set(["vente_auto", "location_auto", "pieces_auto"]);

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);
  const suspended = await refuseIfSuspended(admin, user.id);
  if (suspended) return suspended;

  // Opening shops online follows the same switch as the shop pages.
  if (!(await shopsGate(admin)).visible) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const activity = typeof body.activity_type === "string" && ACTIVITIES.has(body.activity_type)
    ? body.activity_type
    : null;
  if (!activity) {
    return NextResponse.json({ error: "invalid", detail: "Choisissez votre activité." }, { status: 400 });
  }
  // Only the fields actually sent: an absent phone is not an invalid one.
  const sent = Object.fromEntries(
    (["name", "governorate", "city", "phone"] as const)
      .filter((k) => body[k] !== undefined && body[k] !== "")
      .map((k) => [k, body[k]]),
  );
  const { patch, errors } = sanitizeShopProfile(sent, "new");
  if (!patch.name) errors.unshift("Indiquez le nom de la boutique.");
  if (!patch.governorate) errors.push("Choisissez un gouvernorat.");
  if (errors.length > 0) {
    return NextResponse.json({ error: "invalid", detail: [...new Set(errors)].join(" ") }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("shop_members")
    .select("shop:shops (id, status)")
    .eq("user_id", user.id)
    .eq("role", "owner");
  const open = ((existing ?? []) as unknown as { shop: { id: string; status: string } | null }[])
    .find((m) => m.shop && m.shop.status !== "closed");
  if (open?.shop) {
    return NextResponse.json(
      { error: "already_has_shop", detail: "Vous avez déjà une boutique.", shopId: open.shop.id },
      { status: 409 },
    );
  }

  // A free slug: the name's, then -2, -3…
  const base = slugifyShopName(patch.name!);
  const { data: taken } = await admin.from("shops").select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((r) => r.slug as string));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`.slice(0, 60);

  const { data: shop, error } = await admin
    .from("shops")
    .insert({
      owner_id: user.id,
      activity_type: activity,
      slug,
      name: patch.name,
      governorate: patch.governorate,
      city: patch.city ?? null,
      phone: patch.phone ?? null,
      status: "draft",
    })
    .select("id, slug")
    .single();
  if (error || !shop) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "already_has_shop", detail: "Vous avez déjà une boutique." }, { status: 409 });
    }
    return fail("shop_create_failed", 500, error);
  }

  const { error: memberErr } = await admin
    .from("shop_members")
    .insert({ shop_id: shop.id, user_id: user.id, role: "owner" });
  if (memberErr) return fail("shop_member_failed", 500, memberErr);

  logAction(req, user, "shop.create", { shopId: shop.id, activity });
  return NextResponse.json({ ok: true, id: shop.id, slug: shop.slug });
}
