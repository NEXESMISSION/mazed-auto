import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { REQUEST_KINDS } from "@/lib/shops/approvals";
import { revalidatePath } from "next/cache";
import { apiTranslations } from "@/i18n/api";
import { PAGES_SHOWING_SETTINGS, readListingRules, toStoredListingRules } from "@/lib/listingRules";
import { formatPhone, readSiteContact, siteContactProblems } from "@/lib/siteContact";

/**
 * Réglages — the settings that are NOT prices.
 *
 * This route used to write `fee_listing_auction`, `fee_listing_direct`,
 * `promo_home`, `promo_top`, `promo_banner`, `deposit`, `commission` and
 * `final_payment_days`. Every one of those was either a price or auction
 * machinery, and the price half was actively harmful: `/admin/pricing` writes
 * the `products` table, which the sell flow actually reads, while this route
 * wrote `app_settings` keys that only a legacy endpoint reads. They held
 * different numbers — 20 TND against 15 — so an admin who changed the
 * publication fee here changed nothing a seller would ever see.
 *
 * Prices live in `products` and nowhere else (PIVOT-PLAN §2.2). The payee
 * block that was left here moved to /api/admin/payment-methods (D-B1), where
 * the details are checked and each method has its switch: this route no
 * longer writes `payee_*`, so there is one way in for them.
 */

/**
 * The one non-payee key, and it is here rather than in Offres & prix because
 * it is not a price: it decides when a price is WAIVED. Prices still live in
 * `products` and nowhere else.
 */
const MAX_FREE = 50;

/** Ceilings for the personal limits — beyond these a seller is a shop. */
const MAX_PERSONAL_VEHICLES = 20;
const MAX_PERSONAL_PARTS = 100;

/** A month of grace at most: past that, a lapsed shop is simply open for free. */
const MAX_GRACE_DAYS = 30;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rows: { key: string; value: unknown; updated_by: string }[] = [];

  // Welcome allowance: { enabled, count }. Clamped rather than rejected — an
  // admin typing 500 wants "lots", not a 400, and a negative count would make
  // `consume_free_listing` compare against a nonsense allowance.
  if (body.free_listings && typeof body.free_listings === "object") {
    const raw = body.free_listings as { enabled?: unknown; count?: unknown };
    const count = Math.min(Math.max(Math.trunc(Number(raw.count) || 0), 0), MAX_FREE);
    rows.push({
      key: "free_listings",
      value: { enabled: raw.enabled === true && count > 0, count },
      updated_by: user.id,
    });
  }

  // Personal limits (D-P1, 0189): how many annonces a private seller may have
  // live, and whether they are free. The database enforces the numbers on
  // every publication, so a change here takes effect at once and only for
  // what is published next — nothing live is pulled down.
  if (body.personal_limits && typeof body.personal_limits === "object") {
    const raw = body.personal_limits as { vehicles?: unknown; parts?: unknown; free?: unknown };
    const clamp = (v: unknown, max: number) => Math.min(Math.max(Math.trunc(Number(v) || 0), 0), max);
    rows.push({
      key: "personal_limits",
      value: { vehicles: clamp(raw.vehicles, MAX_PERSONAL_VEHICLES), parts: clamp(raw.parts, MAX_PERSONAL_PARTS), free: raw.free !== false },
      updated_by: user.id,
    });
  }

  // The public switch for shop pages (directory, storefronts, shop links on
  // annonces). Off, they are visible to admins only.
  if (body.pro_shops && typeof body.pro_shops === "object") {
    const raw = body.pro_shops as { enabled?: unknown };
    rows.push({ key: "pro_shops", value: { enabled: raw.enabled === true }, updated_by: user.id });
  }

  // What a shop must have approved before it may pay (0196): its opening, a
  // change of plan, a renewal, a boost. Every key written, so the database
  // never falls back to a default the admin did not see on this screen.
  if (body.pro_approvals && typeof body.pro_approvals === "object") {
    const raw = body.pro_approvals as Record<string, unknown>;
    rows.push({
      key: "pro_approvals",
      value: Object.fromEntries(REQUEST_KINDS.map((k) => [k, raw[k] === true])),
      updated_by: user.id,
    });
  }

  // Days a shop's annonces stay up after its period ends (0191, 0192). Read
  // when a period is bought or given: a change applies to the next ones.
  if ("pro_grace_days" in body) {
    const days = Math.min(Math.max(Math.trunc(Number(body.pro_grace_days) || 0), 0), MAX_GRACE_DAYS);
    rows.push({ key: "pro_grace_days", value: days, updated_by: user.id });
  }

  // How long an annonce stays online and how many photos it carries (D-B5).
  // Clamped to the bounds the form shows rather than refused.
  if (body.listing_rules && typeof body.listing_rules === "object") {
    rows.push({ key: "listing_rules", value: toStoredListingRules(readListingRules(body.listing_rules)), updated_by: user.id });
  }

  // How people reach the team (D-B3): the contact and help pages print these.
  // Checked, because a mistyped number is a support line nobody answers.
  if (body.site_contact && typeof body.site_contact === "object") {
    const contact = readSiteContact(body.site_contact);
    const problems = siteContactProblems(contact);
    if (problems.length > 0) {
      const t = await apiTranslations(req, "admin.settings.form.contact.problems");
      return NextResponse.json({ error: "invalid_contact", detail: problems.map((k) => t(k)).join(" ") }, { status: 400 });
    }
    rows.push({
      key: "site_contact",
      value: {
        email: contact.email,
        phone: formatPhone(contact.phone),
        whatsapp: contact.whatsapp ? formatPhone(contact.whatsapp) : "",
        address: contact.address,
      },
      updated_by: user.id,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { error } = await admin.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail("settings_update_failed", 500, error);

  // The static pages that print these are regenerated now, not in an hour.
  if (rows.some((r) => r.key === "listing_rules" || r.key === "site_contact")) {
    for (const page of PAGES_SHOWING_SETTINGS) revalidatePath(page, "page");
  }

  logAction(req, user, "admin.settings.update", { keys: rows.map((r) => r.key) });
  return NextResponse.json({ ok: true, updated: rows.length });
}
