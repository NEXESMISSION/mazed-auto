import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import { SettingsForm, type PayeeSettings } from "./SettingsForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Réglages — what is left once prices moved out.
 *
 * This screen used to carry the publication fee, the three promo prices, the
 * caution, the commission and the final-payment delay. Every one of those was
 * either a price or auction machinery, and the price half was worse than
 * useless: it wrote `app_settings` keys that only a legacy endpoint reads,
 * while the sell flow reads the `products` table that Offres & prix writes.
 * They disagreed — 20 TND here, 15 TND there — so changing the fee on this
 * screen changed nothing a seller would ever see.
 *
 * What remains is the payee block: the bank details a buyer is told to
 * transfer to. Getting those wrong sends real money to the wrong place.
 */
const KEYS = ["payee_name", "payee_bank", "payee_rib", "payee_iban", "payee_d17"] as const;

export default async function AdminSettingsPage() {
  const admin = getServiceSupabase();
  const settings: PayeeSettings = {
    payee_name: "", payee_bank: "", payee_rib: "", payee_iban: "", payee_d17: "",
  };

  if (admin) {
    const { data } = await admin.from("app_settings").select("key, value").in("key", [...KEYS]);
    for (const row of data ?? []) {
      const key = row.key as (typeof KEYS)[number];
      if (!KEYS.includes(key)) continue;
      // app_settings stores jsonb, so a plain string arrives quoted.
      const v = row.value;
      settings[key] = typeof v === "string" ? v : String(v ?? "");
    }
  }

  return (
    <AdminPage>
      <SiteTabs />
      <header>
        <span className={EYEBROW}>Site</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">Réglages</h1>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          Les coordonnées que le vendeur voit au moment de payer. Les prix ne sont pas ici — ils
          vivent dans Offres &amp; prix, et nulle part ailleurs.
        </p>
      </header>
      <SettingsForm initial={settings} />
    </AdminPage>
  );
}
