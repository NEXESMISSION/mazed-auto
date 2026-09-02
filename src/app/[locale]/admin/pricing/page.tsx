import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PricingManager } from "./PricingManager";
import { PRODUCT_SELECT, toProduct, type Product } from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Tarifs — every price on the platform, in one screen.
 *
 * Before v3 a price was a jsonb blob in app_settings that only code could
 * interpret; "5 annonces pour 120 TND" needed a developer. Here it is a row:
 * the admin writes the offer, sets the price, switches it on.
 *
 * Service-role read so inactive products are visible too — the admin has to see
 * what they turned off in order to turn it back on.
 */
export default async function AdminPricingPage() {
  const admin = getServiceSupabase();

  let products: Product[] = [];
  let categories: { id: string; label: string }[] = [];

  if (admin) {
    const [prodRes, catRes] = await Promise.all([
      admin.from("products").select(PRODUCT_SELECT).order("sort_order").order("created_at"),
      admin
        .from("categories")
        .select("id, label_fr, parent_id, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    products = (prodRes.data ?? []).map((r) =>
      toProduct(r as Parameters<typeof toProduct>[0]),
    );

    // Only leaf categories can carry a price: "Véhicules" is a heading, and
    // pricing a heading would silently shadow its children.
    const rows = (catRes.data ?? []) as {
      id: string;
      label_fr: string;
      parent_id: string | null;
    }[];
    const parentLabel = new Map(rows.map((r) => [r.id, r.label_fr]));
    categories = rows
      .filter((r) => r.parent_id != null)
      .map((r) => ({
        id: r.id,
        label: `${parentLabel.get(r.parent_id as string) ?? "—"} › ${r.label_fr}`,
      }));
  }

  return (
    <div className="pb-16">
      <AdminPageHeader
        eyebrow="Argent"
        title="Tarifs"
        description={
          <>
            Tout ce qu&apos;un vendeur peut acheter : l&apos;annonce à l&apos;unité, les packs,
            les mises en avant et le badge. Les prix s&apos;appliquent immédiatement — aucune
            mise en production n&apos;est nécessaire. Un produit désactivé disparaît de la
            vente mais reste ici, car des vendeurs détiennent peut-être déjà ce qu&apos;ils ont
            acheté sous ce tarif.
          </>
        }
      />
      <div className="mt-6">
        <PricingManager initial={products} categories={categories} />
      </div>
    </div>
  );
}
