import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { memberRole, CAN_EDIT_SHOP } from "@/lib/shops/server";
import { ArrowLeft } from "lucide-react";
import { EditListingForm } from "./EditListingForm";

export const dynamic = "force-dynamic";

/**
 * « Modifier » for a live annonce: the price and the phone at once, anything
 * else through review (see /api/annonces/[id]/edit). Anything that is not
 * live goes back to « Mes annonces », where its own action is.
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("myAccount.listings.edit");

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/listings/${id}/modifier`)}`);
  }

  const admin = getServiceSupabase();
  if (!admin) notFound();
  const { data: l } = await admin
    .from("listings")
    .select("id, title, status, seller_id, shop_id, price, price_on_request, negotiable, show_phone")
    .eq("id", id)
    .maybeSingle();
  if (!l) notFound();

  const isSeller = l.seller_id === user!.id;
  let allowed = isSeller;
  if (!allowed && l.shop_id) {
    const role = await memberRole(admin, user!.id, l.shop_id as string);
    allowed = role !== null && CAN_EDIT_SHOP.includes(role);
  }
  if (!allowed) notFound();
  if (l.status !== "published") redirect(`/${locale}/account/listings`);

  return (
    <main className="mx-auto max-w-xl px-4 py-6 lg:py-10">
      <Link
        href="/account/listings"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:-scale-x-100" /> {t("back")}
      </Link>
      <h1 className="mt-3 text-[22px] font-extrabold tracking-tight lg:text-[28px]">{t("title")}</h1>
      <p className="mt-1 line-clamp-2 text-[13px] text-muted">{l.title as string}</p>
      <EditListingForm
        listingId={l.id as string}
        title={l.title as string}
        canReopen={isSeller}
        initial={{
          price: l.price == null ? "" : String(l.price),
          onRequest: l.price_on_request === true,
          negotiable: l.negotiable === true,
          showPhone: l.show_phone !== false,
        }}
      />
    </main>
  );
}
