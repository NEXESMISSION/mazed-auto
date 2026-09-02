import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { NewListingWizard, type WizardCategory } from "./NewListingWizard";
import {
  PRODUCT_SELECT,
  resolveListingFee,
  toProduct,
  type Product,
} from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * Publier une annonce — the v3 sell flow.
 *
 * Everything the wizard needs is resolved here, server-side, because two of
 * these numbers are money and must not be a client's opinion: what publishing
 * costs in each category, and how many publications the seller already owns.
 */
export default async function NewListingPage() {
  const locale = await getLocale();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/annonces/nouvelle`)}`);
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-[13px] text-muted">Service indisponible.</p>
      </main>
    );
  }

  const [catRes, attrRes, prodRes, creditRes, profRes] = await Promise.all([
    admin
      .from("categories")
      .select("id, parent_id, slug, label_fr, kind, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("category_attributes")
      .select("id, category_id, field_key, label, data_type, options, unit, required, sort_order")
      .order("sort_order"),
    admin.from("products").select(PRODUCT_SELECT).eq("is_active", true),
    admin
      .from("seller_credits")
      .select("quota_total, quota_used, expires_at, status")
      .eq("seller_id", user.id)
      .eq("status", "active"),
    admin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
  ]);

  type CatRow = {
    id: string; parent_id: string | null; slug: string;
    label_fr: string; kind: string; sort_order: number;
  };
  const catRows = (catRes.data ?? []) as CatRow[];
  const parents = catRows.filter((c) => c.parent_id == null);

  type AttrRow = {
    id: string; category_id: string; field_key: string; label: string;
    data_type: string; options: { value: string; label: string }[] | null;
    unit: string | null; required: boolean; sort_order: number;
  };
  const attrRows = (attrRes.data ?? []) as AttrRow[];

  const categories: WizardCategory[] = catRows
    .filter((c) => c.parent_id != null)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label_fr,
      kind: c.kind === "part" ? "part" : "vehicle",
      groupLabel: parents.find((p) => p.id === c.parent_id)?.label_fr ?? "Autres",
      attributes: attrRows
        .filter((a) => a.category_id === c.id)
        .map((a) => ({
          fieldKey: a.field_key,
          label: a.label,
          dataType: (["number", "text", "boolean", "select"] as const).includes(
            a.data_type as "text",
          )
            ? (a.data_type as "number" | "text" | "boolean" | "select")
            : "text",
          options: a.options ?? null,
          unit: a.unit,
          required: a.required,
        })),
    }));

  const products: Product[] = (prodRes.data ?? []).map((r) =>
    toProduct(r as Parameters<typeof toProduct>[0]),
  );

  // What each category costs, resolved here so the wizard never guesses. The
  // parent goes in too: a price set on « Pièces de rechange » covers all of its
  // sub-categories (0167), which is how parts are free.
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const feeByCategory: Record<string, number | null> = {};
  for (const c of categories) {
    feeByCategory[c.id] =
      resolveListingFee(products, c.id, parentOf.get(c.id) ?? null)?.price ?? null;
  }

  const now = Date.now();
  const creditsLeft = (creditRes.data ?? []).reduce((n, c) => {
    if (new Date(c.expires_at as string).getTime() <= now) return n;
    return n + Math.max(0, (c.quota_total as number) - (c.quota_used as number));
  }, 0);

  return (
    <NewListingWizard
      categories={categories}
      feeByCategory={feeByCategory}
      creditsLeft={creditsLeft}
      defaultContactName={(profRes.data?.full_name as string | null) ?? ""}
      defaultContactPhone={(profRes.data?.phone as string | null) ?? ""}
      locale={locale}
    />
  );
}
