import { Link } from "@/i18n/navigation";
import { AdminShell } from "@/components/layout/AdminShell";

const TABS: { href: string; label: string }[] = [
  { href: "/admin/cms/pages", label: "Pages" },
  { href: "/admin/cms/faqs", label: "FAQ" },
  { href: "/admin/cms/promos", label: "Promos" },
  { href: "/admin/cms/brands", label: "Marques" },
  { href: "/admin/cms/categories", label: "Catégories" },
  { href: "/admin/cms/plans", label: "Plans" },
  { href: "/admin/cms/features", label: "Équipements" },
  { href: "/admin/cms/cities", label: "Villes" },
  { href: "/admin/cms/notifications", label: "Notifications" },
];

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Contenu</h1>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Pages statiques, FAQ, promos, listes de référence et modèles de
            notification — éditables sans déploiement.
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="px-3 h-9 inline-flex items-center rounded-full text-sm whitespace-nowrap bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)]"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </AdminShell>
  );
}
