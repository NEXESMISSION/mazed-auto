import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProContext } from "@/lib/shops/proContext";
import { activityLabel, isShopVerified, shopInitials } from "@/lib/shops/format";
import { shopMediaUrl, shopsGate } from "@/lib/shops/public";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ProTabs } from "./ProTabs";
import { socialGate } from "@/lib/social/gate";
import { ArrowUpRight, BadgeCheck, Store } from "lucide-react";

export const metadata: Metadata = {
  title: "Espace pro — Mazed Auto",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Espace pro — the frame around every dashboard page: which shop this is, its
 * sections, and the way to its public page.
 *
 * Signed out → login, then back here. Signed in without a shop → the way to
 * open one (/pro/creer) once shops are open, otherwise a plain explanation.
 */
export default async function ProDashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getProContext();
  if (ctx.kind === "anonymous") {
    const locale = await getLocale();
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/pro/dashboard`)}`);
  }

  if (ctx.kind === "no_shop") {
    const admin = getServiceSupabase();
    const canOpen = admin ? (await shopsGate(admin)).visible : false;
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted ring-1 ring-border">
          <Store className="size-6" />
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold tracking-tight">Vous n&apos;avez pas de boutique</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          L&apos;espace pro sert aux concessionnaires, loueurs et vendeurs de pièces.{" "}
          {canOpen
            ? "Ouvrez la vôtre en quelques minutes : elle est en ligne dès le paiement de la formule."
            : "L'ouverture d'une boutique en ligne arrive bientôt ; en attendant, notre équipe peut l'ouvrir pour vous."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href={(canOpen ? "/pro/creer" : "/contact") as never}
            className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]"
          >
            {canOpen ? "Ouvrir ma boutique" : "Nous contacter"}
          </Link>
          <Link
            href={"/account/listings" as never}
            className="tap-target rounded-full border border-border px-4 py-2.5 text-[13px] font-bold hover:border-gold-soft"
          >
            Mes annonces personnelles
          </Link>
        </div>
      </main>
    );
  }

  const { shop } = ctx;
  const marketing = (await socialGate(ctx.admin)).visible;
  const logo = shopMediaUrl(shop.logo_path);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-10">
      <header className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-[15px] font-black text-foreground/70 ring-1 ring-border">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt="" className="size-full object-cover" />
          ) : (
            shopInitials(shop.name)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className="batta-eyebrow">Espace pro</span>
          <h1 className="flex items-center gap-1.5 truncate text-[20px] font-extrabold tracking-tight lg:text-[26px]">
            {shop.name}
            {isShopVerified(shop) && <BadgeCheck className="size-5 shrink-0 text-gold" aria-label="Boutique vérifiée" />}
          </h1>
          <p className="text-[12px] text-muted">{activityLabel(shop.activity_type)} · {shop.governorate}</p>
        </div>
        {shop.status === "active" && (
          <Link
            href={`/boutiques/${shop.slug}` as never}
            className="hidden shrink-0 items-center gap-1 text-[12.5px] font-bold text-gold hover:underline sm:inline-flex"
          >
            Voir ma page <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </header>
      <ProTabs marketing={marketing} />
      <div className="mt-5">{children}</div>
    </main>
  );
}
