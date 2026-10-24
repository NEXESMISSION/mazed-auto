import { redirect } from "next/navigation";
import { coverPhoto } from "@/lib/listingCover";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { currencyLabel, formatTND } from "@/lib/utils";
import { categoryLabel, governorateLabel } from "@/lib/labels";
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
    category: CategoryRow | CategoryRow[] | null;
    photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

type CategoryRow = { slug: string | null; label_fr: string; label_ar: string | null };

type Row = { listing_id: string; listing: ListingRow | ListingRow[] | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function FavorisPage() {
  const locale = await getLocale();
  const t = await getTranslations("myAccount");
  const price = (l: ListingRow, onRequest: string) =>
    l.price_on_request || l.price == null
      ? onRequest
      : `${formatTND(Number(l.price), locale)} ${currencyLabel(locale)}`;
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
         category:categories (slug, label_fr, label_ar),
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
    // Narrow on a phone, wide on a desktop. It was max-w-2xl at every width:
    // on a monitor that is a thin column of 80px thumbnails down the middle of
    // an empty screen — a phone list stretched, not a page.
    <main className="mx-auto max-w-2xl px-4 py-6 lg:max-w-6xl lg:px-6 lg:py-10">
      <header>
        <h1 className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight">
          <Heart className="size-5 text-gold" strokeWidth={2.4} /> {t("favorites.title")}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {rows.length === 0
            ? t("favorites.none")
            : t("favorites.count", { count: rows.length })}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center">
          <p className="text-[13px] text-muted">
            {t("favorites.emptyBody")}
          </p>
          <Link
            href={"/annonces" as never}
            className="batta-btn-luxe tap-target mt-4 inline-flex px-5 py-2.5 text-[13px]"
          >
            <Search className="size-4" /> {t("common.browse")}
          </Link>
        </div>
      ) : (
        <>
          {/* Phone: a list. A saved annonce is scanned by name and price, and a
              row puts both on one line at a readable size. */}
          <div className="mt-5 space-y-3 lg:hidden">
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
                    className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[#0f0f0f] ring-1 ring-border"
                  >
                    {cover ? (
                      <ListingImage path={cover.storage_path} alt="" sizes="80px" fit="cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted">
                        <ImageOff className="size-5" />
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                      {categoryLabel(cat, locale)}
                    </span>
                    <Link href={`/annonces/${l.id}` as never} className="block">
                      <h2 className="mt-0.5 truncate text-[14.5px] font-bold text-foreground hover:text-gold">
                        {l.title}
                      </h2>
                    </Link>
                    <p className="batta-tabular mt-0.5 text-[13.5px] font-extrabold text-foreground">
                      {price(l, t("common.priceOnRequest"))}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                      <MapPin className="size-3" /> {governorateLabel(l.governorate, locale)}
                      {gone && (
                        <span className="ms-2 font-bold text-[var(--accent-deep)]">
                          · {t("favorites.unavailable")}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="self-start">
                    <FavoriteButton listingId={l.id} initialSaved loggedIn size="sm" />
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop: the cards the catalogue uses, so a saved annonce looks
              like the thing that was saved. */}
          <div className="mt-6 hidden gap-5 lg:grid lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r) => {
              const l = r.listing;
              const cat = one(l.category);
              const cover = coverPhoto(l.photos);
              const gone = l.status !== "published";
              return (
                <article
                  key={l.id}
                  className={
                    "group relative overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-gold-soft " +
                    (gone ? "opacity-70" : "")
                  }
                >
                  <Link href={`/annonces/${l.id}` as never} className="block">
                    <div className="relative aspect-[4/3] bg-[#0f0f0f]">
                      {cover ? (
                        <ListingImage
                          path={cover.storage_path}
                          alt={l.title}
                          sizes="(min-width:1280px) 22vw, 30vw"
                          fit="cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-muted">
                          <ImageOff className="size-6" />
                        </span>
                      )}
                      {gone && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/75 py-1 text-center text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-white">
                          {t("favorites.unavailable")}
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* The heart stays on the card: this page is where people come
                      to REMOVE things, and hunting for that control is the one
                      thing it must not make you do. */}
                  <div className="absolute end-2 top-2">
                    <FavoriteButton listingId={l.id} initialSaved loggedIn size="sm" />
                  </div>

                  <div className="p-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                      {categoryLabel(cat, locale)}
                    </span>
                    <Link href={`/annonces/${l.id}` as never} className="block">
                      <h2 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13.5px] font-bold leading-snug text-foreground hover:text-gold">
                        {l.title}
                      </h2>
                    </Link>
                    <p className="batta-tabular mt-1 text-[15px] font-extrabold text-foreground">
                      {price(l, t("common.onRequest"))}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                      <MapPin className="size-3" /> {governorateLabel(l.governorate, locale)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
