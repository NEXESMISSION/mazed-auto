import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { apiTranslations } from "@/i18n/api";
import {
  PAYMENT_METHODS_KEY, bankProblems, d17Problems, readPaymentMethods, type PaymentMethods,
} from "@/lib/payments";
import { konnectBlockers } from "@/lib/payments/konnectAccount";
import { appSecretsReady, deleteAppSecret, readAppSecret, writeAppSecret } from "@/lib/secrets";

/**
 * POST /api/admin/payment-methods — « Moyens de paiement » (D-B1, D-B2).
 *
 *   { bank_transfer: { enabled, holder, bank, rib, iban },
 *     d17:           { enabled, holder, number },
 *     konnect:       { enabled, mode: "test" | "live", wallet },
 *     konnect_key?:  "…"    a new API key — absent or empty keeps the saved one
 *     konnect_key_clear?: true   forget the saved one }
 *
 * The details buyers are told to send money to. Saved as typed while a method
 * is off — they can be filled in over several visits, while the accounts are
 * being opened — but a method is switched ON only with every detail present
 * and valid (RIB 20 digits, IBAN checksum and the same account as the RIB, a
 * Tunisian mobile for D17; a wallet and a key Konnect can be called with) and
 * none of them a sample value. Checked here, not only in the form: this is
 * money.
 *
 * The Konnect key is write-only: encrypted into `app_secrets` (0197) with
 * SETTINGS_SECRET_KEY, refused when that key is missing rather than stored in
 * clear, and never sent back — the screen gets its last four characters.
 */

const digits = (s: string) => s.replace(/\D/g, "");
const alnum = (s: string) => s.replace(/[^0-9a-z]/gi, "").toUpperCase();

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = readPaymentMethods(body);
  // Stored the way it is checked: RIB and D17 as digits, IBAN as one block.
  const methods: PaymentMethods = {
    bank_transfer: {
      ...raw.bank_transfer,
      rib: digits(raw.bank_transfer.rib),
      iban: alnum(raw.bank_transfer.iban),
    },
    d17: { ...raw.d17, number: digits(raw.d17.number).replace(/^216(?=\d{8}$)/, "") },
    konnect: { ...raw.konnect, wallet: raw.konnect.wallet.toLowerCase() },
  };
  const newKey = typeof body.konnect_key === "string" ? body.konnect_key.trim() : "";
  const clearKey = body.konnect_key_clear === true && !newKey;

  const t = await apiTranslations(req, "admin.payments.problems");
  const refused: string[] = [];
  if (methods.bank_transfer.enabled) {
    for (const p of bankProblems(methods.bank_transfer)) refused.push(t(`bank.${p}`));
  }
  if (methods.d17.enabled) {
    for (const p of d17Problems(methods.d17)) refused.push(t(`d17.${p}`));
  }
  if (newKey) {
    // Konnect's keys are one block of letters, digits and a few separators.
    if (!/^[\w.:-]{16,200}$/.test(newKey)) refused.push(t("konnect.keyFormat"));
    else if (!appSecretsReady()) refused.push(t("konnect.noSecretKey"));
  }
  if (methods.konnect.enabled) {
    const keyReadable = Boolean(newKey) || (!clearKey && (await readAppSecret(admin, "konnect_api_key")) !== null);
    for (const p of konnectBlockers(methods.konnect, keyReadable)) refused.push(t(`konnect.${p}`));
  }
  if (refused.length > 0) {
    return NextResponse.json({ error: "invalid_method", detail: refused.join(" ") }, { status: 400 });
  }

  // The key first: a switch saved as on must never point at a key that failed to save.
  if (newKey) {
    const { error } = await writeAppSecret(admin, "konnect_api_key", newKey, user.id);
    if (error) return fail("payment_methods_update_failed", 500, error);
  } else if (clearKey) {
    const { error } = await deleteAppSecret(admin, "konnect_api_key");
    if (error) return fail("payment_methods_update_failed", 500, error);
  }

  const { error } = await admin
    .from("app_settings")
    .upsert({ key: PAYMENT_METHODS_KEY, value: methods, updated_by: user.id }, { onConflict: "key" });
  if (error) return fail("payment_methods_update_failed", 500, error);

  // Which methods are open, not the numbers: the journal is read by more people than the bank.
  logAction(req, user, "admin.payment_methods.update", {
    bank_transfer: methods.bank_transfer.enabled,
    d17: methods.d17.enabled,
    konnect: methods.konnect.enabled,
    konnect_mode: methods.konnect.mode,
    konnect_key: newKey ? "replaced" : clearKey ? "cleared" : "kept",
  });
  return NextResponse.json({ ok: true });
}
