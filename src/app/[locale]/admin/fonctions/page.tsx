import { getTranslations } from "next-intl/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import { readModules } from "@/lib/modules";
import { ModulesBoard } from "./ModulesBoard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Fonctions (D-B4) — every module of the site on one screen: running or not,
 * and if not, exactly what it still needs (a key on Vercel, details in another
 * screen). The ones this screen can switch have their switch here; « Démarrer
 * les fonctions prêtes » turns on all the ready ones at once.
 */
export default async function AdminModulesPage() {
  const t = await getTranslations("admin.modules");
  const admin = getServiceSupabase();
  const modules = admin ? await readModules(admin) : [];

  return (
    <AdminPage>
      <SiteTabs />
      <header>
        <span className={EYEBROW}>{t("eyebrow")}</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">{t("description")}</p>
      </header>
      <ModulesBoard modules={modules} />
    </AdminPage>
  );
}
