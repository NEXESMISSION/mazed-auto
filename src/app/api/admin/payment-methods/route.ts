import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { apiTranslations } from "@/i18n/api";
import {
  PAYMENT_METHODS_KEY, bankProblems, d17Problems, readPaymentMethods, type PaymentMethods,
} from "@/lib/payments";

/**
 * POST /api/admin/payment-methods — « Moyens de paiement » (D-B1).
 *
 *   { bank_transfer: { enabled, holder, bank, rib, iban },
 *     d17:           { enabled, holder, number } }
 *
 * The details buyers are told to send money to. Saved as typed while a method
 * is off — they can be filled in over several visits, while the accounts are
 * being opened — but a method is switched ON only with every detail present
 * and valid (RIB 20 digits, IBAN checksum and the same account as the RIB, a
 * Tunisian mobile for D17) and none of them a sample value. Checked here, not
 * only in the form: this is money.
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
  };

  const t = await apiTranslations(req, "admin.payments.problems");
  const refused: string[] = [];
  if (methods.bank_transfer.enabled) {
    for (const p of bankProblems(methods.bank_transfer)) refused.push(t(`bank.${p}`));
  }
  if (methods.d17.enabled) {
    for (const p of d17Problems(methods.d17)) refused.push(t(`d17.${p}`));
  }
  if (refused.length > 0) {
    return NextResponse.json({ error: "invalid_method", detail: refused.join(" ") }, { status: 400 });
  }

  const { error } = await admin
    .from("app_settings")
    .upsert({ key: PAYMENT_METHODS_KEY, value: methods, updated_by: user.id }, { onConflict: "key" });
  if (error) return fail("payment_methods_update_failed", 500, error);

  // Which methods are open, not the numbers: the journal is read by more people than the bank.
  logAction(req, user, "admin.payment_methods.update", {
    bank_transfer: methods.bank_transfer.enabled,
    d17: methods.d17.enabled,
  });
  return NextResponse.json({ ok: true });
}
