import { getTranslations } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import {
  SettingsForm,
  type PayeeSettings,
  type FreeListings,
  type PersonalLimits,
} from "./SettingsForm";

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
  const t = await getTranslations("admin.settings");
  const admin = getServiceSupabase();
  const settings: PayeeSettings = {
    payee_name: "", payee_bank: "", payee_rib: "", payee_iban: "", payee_d17: "",
  };

  // Off with an allowance of 3: the shape the migration seeds, and the shape
  // a missing row has to fall back to — reading "enabled" off undefined would
  // otherwise render the toggle as on.
  let freeListings: FreeListings = { enabled: false, count: 3 };
  // The shapes 0189 seeds, for the same reason.
  let personal: PersonalLimits = { vehicles: 1, parts: 5, free: true };
  let proShops = false;

  if (admin) {
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [...KEYS, "free_listings", "personal_limits", "pro_shops"]);
    for (const row of data ?? []) {
      if (row.key === "free_listings") {
        const v = (row.value ?? {}) as { enabled?: boolean; count?: number };
        freeListings = { enabled: v.enabled === true, count: Number(v.count) || 0 };
        continue;
      }
      if (row.key === "personal_limits") {
        const v = (row.value ?? {}) as { vehicles?: number; parts?: number; free?: boolean };
        personal = {
          vehicles: Number.isFinite(v.vehicles) ? Number(v.vehicles) : 1,
          parts: Number.isFinite(v.parts) ? Number(v.parts) : 5,
          free: v.free !== false,
        };
        continue;
      }
      if (row.key === "pro_shops") {
        proShops = (row.value as { enabled?: boolean } | null)?.enabled === true;
        continue;
      }
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
        <span className={EYEBROW}>{t("eyebrow")}</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("description")}
        </p>
      </header>
      <SettingsForm
        initial={settings}
        initialFree={freeListings}
        initialPersonal={personal}
        initialProShops={proShops}
      />
    </AdminPage>
  );
}
