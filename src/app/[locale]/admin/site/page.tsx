import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/kit";
import {
  LayoutTemplate, MessageSquare, FileText, Bell, Settings2, Activity,
  ArrowUpRight, type LucideIcon,
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
  const sb = await getServerSupabase();
  const head = (t: string) => sb.from(t).select("*", { count: "exact", head: true });

  const [featured, popups, docs, notifs] = await Promise.all([
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
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  const cards: Card[] = [
    {
      label: "Accueil",
      href: "/admin/home",
      Icon: LayoutTemplate,
      description: "Choisir les annonces mises en avant sur la page d'accueil.",
      count: n(featured),
      unit: "en vedette",
    },
    {
      label: "Popups",
      href: "/admin/popups",
      Icon: MessageSquare,
      description: "Messages affichés aux visiteurs, avec ciblage et planning.",
      count: n(popups),
      unit: "configurés",
    },
    {
      label: "Documents légaux",
      href: "/admin/legal-docs",
      Icon: FileText,
      description: "CGU, confidentialité, mentions — le texte publié sur le site.",
      count: n(docs),
      unit: "documents",
    },
    {
      label: "Diffusions",
      href: "/admin/notifications",
      Icon: Bell,
      description: "Notifications envoyées aux vendeurs et aux acheteurs.",
      count: n(notifs),
      unit: "envoyées",
    },
    {
      label: "Réglages",
      href: "/admin/settings",
      Icon: Settings2,
      description: "Coordonnées bancaires, durée de vie des annonces, contact.",
    },
    {
      label: "Journal d'activité",
      href: "/admin/activity",
      Icon: Activity,
      description: "Qui a fait quoi, et quand. La trace d'audit de la console.",
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Console"
        title="Site"
        description="Le contenu et la configuration du site public. Ce que l'on règle une fois, puis rarement."
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href as "/admin"}
            className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition hover:border-[var(--gold-soft)] hover:bg-surface-2"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-muted transition group-hover:text-gold">
                <c.Icon className="size-4" strokeWidth={2} />
              </span>
              <ArrowUpRight
                className="size-4 text-subtle transition group-hover:text-gold"
                strokeWidth={2}
              />
            </div>
            <div className="mt-3.5 text-[14px] font-bold text-foreground">{c.label}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.description}</p>
            {c.count != null && (
              <div className="batta-tabular mt-3 text-[11.5px] font-semibold text-subtle">
                {c.count.toLocaleString("fr-FR")} {c.unit}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
