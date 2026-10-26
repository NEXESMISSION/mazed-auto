import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { availableMethods, fetchPaymentMethods } from "@/lib/payments";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import {
  LayoutTemplate, MessageSquare, FileText, Bell, Settings2, Activity, Wallet,
  ArrowRight, type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Site — the things you configure once and revisit monthly.
 *
 * These six screens each had their own sidebar entry, which put "changer le
 * texte des CGU" at the same level as "valider les annonces du jour". They
 * are grouped behind one destination now; Phase 7 turns this hub into tabs
 * over the same six, once each of them has been rebuilt on the kit.
 *
 * The counts are here because an empty section and a broken one look
 * identical from a menu — a card that says "1 popup" is a card you can trust.
 */

type Card = {
  label: string;
  href: string;
  Icon: LucideIcon;
  description: string;
  count?: number;
  unit?: string;
};

export default async function AdminSiteHub() {
  const t = await getTranslations("admin.site");
  const sb = await getServerSupabase();
  const head = (t: string) => sb.from(t).select("*", { count: "exact", head: true });

  const [featured, popups, docs, notifs, methods] = await Promise.all([
    // Featured placement is `featured_rank` + an optional `featured_until`
    // (migration 0171) — a lapsed placement still carries a rank, so the
    // count has to exclude it or the card overstates what is on the home page.
    head("listings")
      .eq("status", "published")
      .not("featured_rank", "is", null)
      .or(`featured_until.is.null,featured_until.gt.${new Date().toISOString()}`),
    head("popups"),
    head("legal_doc_kinds"),
    head("notifications"),
    fetchPaymentMethods(getServiceSupabase() ?? sb),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  const cards: Card[] = [
    {
      label: t("cards.home.label"),
      href: "/admin/home",
      Icon: LayoutTemplate,
      description: t("cards.home.description"),
      count: n(featured),
      unit: t("cards.home.unit"),
    },
    {
      label: t("cards.popups.label"),
      href: "/admin/popups",
      Icon: MessageSquare,
      description: t("cards.popups.description"),
      count: n(popups),
      unit: t("cards.popups.unit"),
    },
    {
      label: t("cards.legal.label"),
      href: "/admin/legal-docs",
      Icon: FileText,
      description: t("cards.legal.description"),
      count: n(docs),
      unit: t("cards.legal.unit"),
    },
    {
      label: t("cards.broadcasts.label"),
      href: "/admin/notifications",
      Icon: Bell,
      description: t("cards.broadcasts.description"),
      count: n(notifs),
      unit: t("cards.broadcasts.unit"),
    },
    {
      label: t("cards.settings.label"),
      href: "/admin/settings",
      Icon: Settings2,
      description: t("cards.settings.description"),
    },
    {
      // How many methods a buyer can pay with right now — 0 is the state to fix.
      label: t("cards.payments.label"),
      href: "/admin/moyens-paiement",
      Icon: Wallet,
      description: t("cards.payments.description"),
      count: availableMethods(methods).length,
      unit: t("cards.payments.unit"),
    },
    {
      label: t("cards.activity.label"),
      href: "/admin/activity",
      Icon: Activity,
      description: t("cards.activity.description"),
    },
  ];

  return (
    <AdminPage>
      <header>
        <span className={EYEBROW}>{t("eyebrow")}</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("description")}
        </p>
      </header>

      <ul className="mt-7 border-t border-border">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href as "/admin"}
              className="group flex items-start gap-4 border-b border-border py-3.5 transition hover:bg-[var(--row-hover)]"
            >
              <c.Icon
                className="mt-0.5 size-4 shrink-0 text-subtle transition group-hover:text-[var(--gold)]"
                strokeWidth={2}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">{c.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-subtle">{c.description}</span>
              </span>
              {c.count != null && (
                <span className="batta-tabular hidden shrink-0 text-[11.5px] text-subtle sm:block">
                  {c.count.toLocaleString("fr-FR")} {c.unit}
                </span>
              )}
              <ArrowRight
                className="mt-0.5 size-3.5 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-[var(--gold)] rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
          </li>
        ))}
      </ul>
    </AdminPage>
  );
}
