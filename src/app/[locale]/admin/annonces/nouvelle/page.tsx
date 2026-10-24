import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { attributeLabel, attributeOptionLabel, categoryLabel, unitLabel } from "@/lib/labels";
import { PageHeader } from "@/components/admin/kit";
import { adminBtn } from "@/components/admin/AdminButton";
import { ManualListingForm, type AdminCategory } from "../ManualListingForm";
import type { ListingAttribute } from "@/components/listing/fields";
import { ArrowLeft } from "lucide-react";

/** `category_attributes.data_type` is a free-text column; the renderer takes a
 *  closed union. Anything unrecognised falls back to a text box rather than
 *  crashing the form — a new attribute type should degrade, not break. */
const DATA_TYPES = ["text", "number", "boolean", "select"] as const;
function asDataType(v: string): ListingAttribute["dataType"] {
  return (DATA_TYPES as readonly string[]).includes(v)
    ? (v as ListingAttribute["dataType"])
    : "text";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Publishing on a seller's behalf — the phone-call and WhatsApp path.
 *
 * This used to sit at the top of the moderation queue, so the list you opened
 * the page for started below a full-height form, and every visit to /annonces
 * paid for loading every profile and every category attribute whether or not
 * anyone was creating anything. It is its own route now; the queue links to it.
 *
 * The form itself is unchanged — its decisions are right and were verified
 * against the live database: the annonce belongs to the seller (not the admin),
 * `fee_waived_by` records who comped it so revenue reporting shows the gap, and
 * the attestation is stamped `v1-admin` because the seller did not personally
 * tick the sworn-accuracy statement — someone typed the car in from a call.
 */
export default async function AdminNewListingPage() {
  const admin = getServiceSupabase();
  const t = await getTranslations("adminOps");
  const locale = await getLocale();

  if (!admin) {
    return (
      <div>
        <PageHeader eyebrow={t("create.eyebrow")} title={t("create.title")} />
        <p className="mt-6 text-[13px] text-muted">{t("common.noService")}</p>
      </div>
    );
  }

  // Profiles are NOT fetched here. The seller picker searches
  // /api/admin/vendeurs/search as you type, so this page loads the categories
  // it needs and nothing else — it used to pull 500 profiles on every visit to
  // populate a list that was then rendered in full before anyone had typed.
  const [catRes, attrRes] = await Promise.all([
    admin
      .from("categories")
      .select("id, parent_id, slug, label_fr, label_ar, kind, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("category_attributes")
      .select("category_id, field_key, label, data_type, options, unit, required, sort_order")
      .order("sort_order"),
  ]);


  type CatRow = { id: string; parent_id: string | null; slug: string; label_fr: string; label_ar: string | null; kind: string };
  type AttrRow = {
    category_id: string; field_key: string; label: string; data_type: string;
    options: { value: string; label: string }[] | null;
    unit: string | null; required: boolean;
  };
  const catRows = (catRes.data ?? []) as CatRow[];
  const attrRows = (attrRes.data ?? []) as AttrRow[];
  const parents = catRows.filter((c) => c.parent_id == null);

  const categories: AdminCategory[] = catRows
    .filter((c) => c.parent_id != null)
    .map((c) => {
      const parent = parents.find((p) => p.id === c.parent_id);
      return {
        id: c.id,
        label: categoryLabel(c, locale),
        groupLabel: parent ? categoryLabel(parent, locale) : "",
        kind: c.kind === "part" ? "part" : "vehicle",
        // Labels resolved here, in the console's language: the shared field
        // renderer shows whatever it is given.
        attributes: attrRows
          .filter((a) => a.category_id === c.id)
          .map((a) => ({
            fieldKey: a.field_key,
            label: attributeLabel(a.field_key, a.label, locale),
            dataType: asDataType(a.data_type),
            options: a.options?.map((o) => ({
              value: o.value,
              label: attributeOptionLabel(a.field_key, o.value, o.label, locale),
            })) ?? null,
            unit: a.unit ? unitLabel(a.unit, locale) : null,
            required: a.required,
          })),
      };
    });

  return (
    <div>
      <PageHeader
        eyebrow={t("create.eyebrow")}
        title={t("create.title")}
        description={t("create.pageDescription")}
        actions={
          <Link href="/admin/annonces" className={adminBtn("ghost", "md")}>
            <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2.4} />
            {t("create.backToQueue")}
          </Link>
        }
      />

      <div className="mt-6">
        <ManualListingForm categories={categories} standalone />
      </div>
    </div>
  );
}
