import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { HomeCurator, type CuratorRow } from "./HomeCurator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Accueil — what a visitor sees first, decided here.
 *
 * This page used to edit `promo_home_featured` on `properties`: the auction
 * table, deleted in the pivot. It had had no effect on anything a visitor sees
 * for weeks — the home page was ordering by published_at and the card image
 * was whichever photo the seller uploaded first. Both are choices now, and
 * this is where they are made.
 */
export default async function AdminHomePage() {
  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <div>
        <AdminPageHeader eyebrow="Accueil" title="Mise en avant" description="Service indisponible." />
      </div>
    );
  }

  const [{ data: listings }, { data: layoutRow }] = await Promise.all([
    admin
      .from("listings")
      .select(
        `id, title, governorate, featured_rank,
         photos:listing_photos (id, storage_path, sort_order, is_cover)`,
      )
      .eq("status", "published")
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false })
      .limit(60),
    admin.from("app_settings").select("value").eq("key", "home_layout").maybeSingle(),
  ]);

  const rows = ((listings ?? []) as CuratorRow[]).map((r) => ({
    ...r,
    photos: (r.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));

  const v = (layoutRow?.value ?? {}) as Partial<{ hero_slots: number; side_slots: number; fallback: string }>;
  const layout = {
    hero_slots: v.hero_slots ?? 1,
    side_slots: v.side_slots ?? 3,
    fallback: v.fallback ?? "recent",
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Accueil"
        title="Mise en avant"
        description="Choisissez les annonces à la une, l'image de chaque annonce, et la composition de la page d'accueil."
      />
      <div className="mt-6">
        <HomeCurator rows={rows} layout={layout} />
      </div>
    </div>
  );
}
