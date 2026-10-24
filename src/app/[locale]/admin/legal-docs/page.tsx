import { getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { PropertyType } from "@/lib/types";
import { LegalDocsEditor, type LegalDocKindRow } from "./LegalDocsEditor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROPERTY_TYPES: PropertyType[] = [
  "sedan", "suv", "hatchback", "pickup",
  "van", "coupe", "convertible", "wagon", "spare_part",
];

export default async function AdminLegalDocsPage() {
  const t = await getTranslations("admin.legalDocs");
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("legal_doc_kinds")
    .select("id, property_type, label, description, required, sort_order")
    .order("property_type")
    .order("sort_order")
    .order("label");

  const byType = new Map<PropertyType, LegalDocKindRow[]>();
  for (const t of PROPERTY_TYPES) byType.set(t, []);
  for (const row of (data ?? []) as LegalDocKindRow[]) {
    byType.get(row.property_type)?.push(row);
  }

  const initial = Object.fromEntries(
    PROPERTY_TYPES.map((t) => [t, byType.get(t) ?? []]),
  ) as Record<PropertyType, LegalDocKindRow[]>;

  return (
    <div>
      <SiteTabs />
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t.rich("description", { b: (chunks) => <b>{chunks}</b> })}
      />

      <div className="mt-5">
        <LegalDocsEditor initial={initial} />
      </div>
    </div>
  );
}
