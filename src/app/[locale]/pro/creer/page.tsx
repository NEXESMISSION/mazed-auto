import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { shopsGate } from "@/lib/shops/public";
import { getProContext } from "@/lib/shops/proContext";
import { plansForSale } from "@/lib/shops/plans";
import { ShopsPreviewBanner } from "../../boutiques/ShopsPreviewBanner";
import { CreateShopWizard } from "./CreateShopWizard";

export const metadata: Metadata = {
  title: "Ouvrir ma boutique — Mazed Auto",
  robots: { index: false, follow: false },
};

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

  const plans = await plansForSale(admin);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 lg:pt-10">
      {gate.preview && <ShopsPreviewBanner />}
      <span className="batta-eyebrow">Professionnels</span>
      <h1 className="mt-1 text-[24px] font-black tracking-tight lg:text-[30px]">Ouvrir ma boutique</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Votre compte reste le même : vos annonces personnelles restent les vôtres.
      </p>
      <CreateShopWizard plans={plans} />
    </main>
  );
}
