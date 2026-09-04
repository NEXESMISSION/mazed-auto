import { redirect } from "next/navigation";
import { coverPhoto } from "@/lib/listingCover";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { Heart, ImageOff, MapPin, Search } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Favoris — the annonces this buyer saved.
 *
 * This page exists because saving one had nowhere to lead: the heart wrote to
 * `watchlist`, and the only view over that table was the auction-shaped
 * activity tab. A save button whose result you cannot find is worse than no
 * save button.
 *
 * Expired and archived listings are kept in the list rather than hidden. If
 * someone saved a car and it came down, "plus disponible" is the answer they
 * came for — silently dropping it looks like we lost their favourite.
 */

type ListingRow = {
    id: string; title: string; price: number | null; price_on_request: boolean;
    governorate: string; status: string;
    category: { label_fr: string } | { label_fr: string }[] | null;
    photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

type Row = { listing_id: string; listing: ListingRow | ListingRow[] | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function FavorisPage() {
  const locale = await getLocale();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/favoris`)}`);
  }

  // Read through the service role for the join (listing columns are
  // column-granted), but scoped to this user's own watchlist rows.
  const db = getServiceSupabase() ?? supabase;
  const { data } = await db
    .from("watchlist")
    .select(
      `listing_id,
       listing:listings (
         id, title, price, price_on_request, governorate, status,
         category:categories (label_fr),
         photos:listing_photos (storage_path, sort_order, is_cover)
       )`,
    )
    .eq("user_id", user.id)
    .not("listing_id", "is", null)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as Row[])
    .map((r) => ({ listing: one<ListingRow>(r.listing) }))
    .filter((r): r is { listing: ListingRow } => r.listing !== null);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
      <header>
        <h1 className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight">
          <Heart className="size-5 text-gold" strokeWidth={2.4} /> Favoris
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {rows.length === 0
            ? "Vous n'avez rien enregistré pour l'instant."
            : `${rows.length} annonce${rows.length > 1 ? "s" : ""} enregistrée${rows.length > 1 ? "s" : ""}.`}
        </p>
      </header>

      <div className="mt-5 space-y-3">
        {rows.map((r) => {
          const l = r.listing;
          const cat = one(l.category);
          const cover = coverPhoto(l.photos);
          const gone = l.status !== "published";
          return (
            <article
              key={l.id}
              className={
                "flex gap-3 rounded-2xl border border-border bg-surface p-3 " +
                (gone ? "opacity-70" : "")
              }
            >
              <Link
                href={`/annonces/${l.id}` as never}
                className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
              >
                {cover ? (
                  <ListingImage path={cover.storage_path} alt="" sizes="80px" />
                ) : (
                  <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  {cat?.label_fr ?? ""}
                </span>
                <Link href={`/annonces/${l.id}` as never} className="block">
                  <h2 className="mt-0.5 truncate text-[14.5px] font-bold text-foreground hover:text-gold">
                    {l.title}
                  </h2>
                </Link>
                <p className="batta-tabular mt-0.5 text-[13.5px] font-extrabold text-foreground">
                  {l.price_on_request || l.price == null
                    ? "Prix sur demande"
                    : `${formatTND(Number(l.price), locale)} TND`}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                  <MapPin className="size-3" /> {l.governorate}
                  {gone && <span className="ms-2 font-bold text-[var(--accent-deep)]">· plus disponible</span>}
                </p>
              </div>

              <div className="self-start">
                <FavoriteButton listingId={l.id} initialSaved loggedIn size="sm" />
              </div>
            </article>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center">
            <p className="text-[13px] text-muted">
              Touchez le cœur sur une annonce pour la retrouver ici.
            </p>
            <Link href={"/annonces" as never} className="batta-btn-luxe tap-target mt-4 inline-flex px-5 py-2.5 text-[13px]">
              <Search className="size-4" /> Parcourir les annonces
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
