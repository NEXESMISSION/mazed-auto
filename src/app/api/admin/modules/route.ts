import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { apiTranslations } from "@/i18n/api";
import { SWITCHABLE, readModules, setModule, type Switchable } from "@/lib/modules";

/**
 * POST /api/admin/modules — « Fonctions » (D-B4).
 *
 *   { key: "shops" | "konnect" | "social" | "sms" | "email", on: boolean }
 *   { start_ready: true }   switch on every module that is ready and off
 *
 * A module is switched on only when the server finds what it needs (its keys
 * on Vercel, its account in the back office) — checked here, now, whatever the
 * screen showed. Switching off is always allowed.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as { key?: unknown; on?: unknown; start_ready?: unknown };
  const modules = await readModules(admin);

  if (body.start_ready === true) {
    const started: Switchable[] = [];
    for (const m of modules) {
      if (!m.switchable || m.on || !m.ready) continue;
      const res = await setModule(admin, m.key as Switchable, true, user.id, modules);
      if (!res.ok) return fail("modules_update_failed", 500, res.error);
      started.push(m.key as Switchable);
    }
    logAction(req, user, "admin.modules.start_ready", { started });
    return NextResponse.json({ ok: true, started });
  }

  const key = SWITCHABLE.find((k) => k === body.key);
  if (!key || typeof body.on !== "boolean") return fail("invalid", 400);
  const res = await setModule(admin, key, body.on, user.id, modules);
  if (!res.ok) {
    if (res.error) return fail("modules_update_failed", 500, res.error);
    const t = await apiTranslations(req, "admin.modules");
    return NextResponse.json({ error: "module_not_ready", detail: t("notReady") }, { status: 409 });
  }
  logAction(req, user, "admin.modules.set", { key, on: body.on });
  return NextResponse.json({ ok: true });
}
