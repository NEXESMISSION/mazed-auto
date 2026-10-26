import { getTranslations } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import { DEFAULT_APPROVALS, readApprovals, type Approvals } from "@/lib/shops/approvals";
import {
  SettingsForm,
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
 * The payee block went too, to « Moyens de paiement » (D-B1): the details a
 * buyer is told to send money to deserve a switch per method and checks a
 * free-text field never had.
 */
export default async function AdminSettingsPage() {
  const t = await getTranslations("admin.settings");
  const admin = getServiceSupabase();

  // Off with an allowance of 3: the shape the migration seeds, and the shape
  // a missing row has to fall back to — reading "enabled" off undefined would
  // otherwise render the toggle as on.
  let freeListings: FreeListings = { enabled: false, count: 3 };
  // The shapes 0189 seeds, for the same reason.
  let personal: PersonalLimits = { vehicles: 1, parts: 5, free: true };
  let proShops = false;
  // The defaults the database falls back to (0196, 0189).
  let approvals: Approvals = DEFAULT_APPROVALS;
  let graceDays = 7;

  if (admin) {
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", ["free_listings", "personal_limits", "pro_shops", "pro_approvals", "pro_grace_days"]);
    for (const row of data ?? []) {
      if (row.key === "pro_approvals") {
        approvals = readApprovals(row.value);
        continue;
      }
      if (row.key === "pro_grace_days") {
        const n = Number(row.value);
        graceDays = Number.isFinite(n) ? n : 7;
        continue;
      }
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
      }
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
        initialFree={freeListings}
        initialPersonal={personal}
        initialProShops={proShops}
        initialApprovals={approvals}
        initialGraceDays={graceDays}
      />
    </AdminPage>
  );
}
