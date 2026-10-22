import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { shopMediaUrl } from "@/lib/shops/public";
import { ShopProfileForm, type ShopDocument, type ShopPrivate } from "./ShopProfileForm";

/**
 * Ma boutique — what the shop's public page says, and the private details
 * behind it. Staff members see the page but cannot change it: the routes
 * refuse them too (`CAN_EDIT_SHOP`).
 */
export default async function ProShopPage() {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop, role } = ctx;
  const canEdit = CAN_EDIT_SHOP.includes(role);

  const [privRes, docRes] = await Promise.all([
    canEdit
      ? admin
          .from("shop_private")
          .select("legal_name, tax_id, rne_number, legal_address, contact_email")
          .eq("shop_id", shop.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canEdit
      ? admin
          .from("shop_documents")
          .select("id, kind, status, created_at, note")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <ShopProfileForm
      canEdit={canEdit}
      shop={{
        id: shop.id,
        name: shop.name,
        description: shop.description ?? "",
        phone: shop.phone ?? "",
        whatsapp: shop.whatsapp ?? "",
        governorate: shop.governorate,
        city: shop.city ?? "",
        address: shop.address ?? "",
        openingHours: (shop.opening_hours ?? {}) as Record<string, string>,
        logoUrl: shopMediaUrl(shop.logo_path),
        bannerUrl: shopMediaUrl(shop.banner_path),
        verificationStatus: shop.verification_status,
      }}
      initialPrivate={(privRes.data as ShopPrivate | null) ?? {
        legal_name: null, tax_id: null, rne_number: null, legal_address: null, contact_email: null,
      }}
      documents={(docRes.data ?? []) as ShopDocument[]}
    />
  );
}
