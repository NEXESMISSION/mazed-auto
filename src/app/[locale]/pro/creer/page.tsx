import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { shopsGate } from "@/lib/shops/public";
import { getProContext } from "@/lib/shops/proContext";
import { plansForSale } from "@/lib/shops/plans";
import { approvalsSetting } from "@/lib/shops/approvals";
import { ShopsPreviewBanner } from "../../boutiques/ShopsPreviewBanner";
import { CreateShopWizard } from "./CreateShopWizard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pro.create" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

/**
 * Ouvrir ma boutique — activité → informations → formule → paiement.
 *
 * The justificatifs are not a step: they are asked for afterwards, from the
 * dashboard, because they earn the badge and do not gate trading. A shop that
 * already exists goes straight to its dashboard.
 */
export default async function CreateShopPage() {
  const admin = getServiceSupabase();
  if (!admin) notFound();
  const gate = await shopsGate(admin);
  const ctx = await getProContext();
  const locale = await getLocale();

  if (ctx.kind === "anonymous") {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/pro/creer`)}`);
  }
  if (!gate.visible) notFound();
  if (ctx.kind === "shop") redirect(`/${locale}/pro/dashboard`);

  const [plans, approvals] = await Promise.all([plansForSale(admin), approvalsSetting(admin)]);
  const t = await getTranslations("pro.create");
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 lg:pt-10">
      {gate.preview && <ShopsPreviewBanner />}
      <span className="batta-eyebrow">{t("eyebrow")}</span>
      <h1 className="mt-1 text-[24px] font-black tracking-tight lg:text-[30px]">{t("title")}</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        {t("intro")}
      </p>
      <CreateShopWizard plans={plans} approval={approvals.opening} />
    </main>
  );
}
