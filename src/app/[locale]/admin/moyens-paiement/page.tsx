import { getTranslations } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import { EMPTY_METHODS, fetchPaymentMethods } from "@/lib/payments";
import { konnectStatus, type KonnectStatus } from "@/lib/payments/konnectAccount";
import { appSecretsReady } from "@/lib/secrets";
import { PaymentMethodsForm } from "./PaymentMethodsForm";
import { requireAdminPage } from "@/lib/admin/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Moyens de paiement (D-B1) — the details buyers are told to send money to,
 * method by method, and whether each one is offered.
 *
 * Nothing is offered until it is switched on here with real details: the
 * checkout shows only the open methods, and with none open no transfer / D17
 * order is created at all. Online payment (Konnect, D-B2) is set here too: its
 * switch, gateway and wallet, and an API key the server encrypts and never
 * shows again.
 */
export default async function AdminPaymentMethodsPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.payments");
  const admin = getServiceSupabase();
  const methods = admin ? await fetchPaymentMethods(admin) : EMPTY_METHODS;
  const konnect: KonnectStatus = admin
    ? await konnectStatus(admin, appSecretsReady())
    : { key: null, canSaveKeys: false, env: false, live: false };

  return (
    <AdminPage>
      <SiteTabs />
      <header>
        <span className={EYEBROW}>{t("eyebrow")}</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">{t("description")}</p>
      </header>
      <PaymentMethodsForm initial={methods} konnect={konnect} />
    </AdminPage>
  );
}
