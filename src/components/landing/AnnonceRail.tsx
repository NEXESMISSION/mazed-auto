import { Link } from "@/i18n/navigation";
import { rankListings } from "@/lib/home/ranking";
import { heroUsedIds } from "./AnnonceHero";
import { coverPhoto } from "@/lib/listingCover";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { TrendingRail } from "@/components/landing/TrendingRail";
import { ArrowRight, BadgeCheck, ImageOff, MapPin } from "lucide-react";
import { LinkBusy } from "@/components/ui/LinkBusy";

/**
 * A rail of v3 annonces — vehicles or spare parts.
 *
 * Self-contained (does its own read, renders nothing when empty) so the home
 * page gains the new catalog with one line per rail, while the auction sections
 * below keep working for the 60 lots still running. When those retire in Phase
 * 6 these rails become the whole page.
 *
 * Its own card rather than PropertyCard: that component takes an
 * AuctionWithProperty and speaks in bids and countdowns, neither of which a
 * fixed-price annonce has.
 */

type Row = {
  id: string;
  title: string;
  price: number | null;
  price_on_request: boolean;
  governorate: string;
  seller_id: string;
  category: { label_fr: string } | { label_fr: string }[] | null;
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
  published_at?: string | null;
  boost?: number | null;
  boost_until?: string | null;
  view_count?: number | null;
  contact_reveal_count?: number | null;
};

export async function AnnonceRail({
  kind,
  eyebrow,
  title,
  subtitle,
  limit = 10,
  locale,
}: {
  kind: "vehicle" | "part";
  eyebrow: string;
  title: string;
  subtitle?: string;
  limit?: number;
  locale: string;
}) {
  const admin = getServiceSupabase();
  if (!admin) return null;

  const { data: cats } = await admin
    .from("categories")
    .select("id")
    .eq("kind", kind)
    .not("parent_id", "is", null);
  const ids = (cats ?? []).map((c) => c.id as string);
  if (ids.length === 0) return null;

  // Fetch WIDER than the rail shows, then rank and drop what the hero is
  // already displaying. Before this the rail was "the newest `limit`", which
  // on a home page whose cover is also "the newest" meant the same cars in
  // both places, and the rest of the catalogue in neither.
  const { data } = await admin
    .from("listings")
    .select(
      `id, title, price, price_on_request, governorate, seller_id,
       published_at, boost, boost_until, view_count, contact_reveal_count,
       category:categories (label_fr),
       photos:listing_photos (storage_path, sort_order, is_cover)`,
    )
    .eq("status", "published")
    .in("category_id", ids)
    .order("published_at", { ascending: false })
    .limit(Math.max(limit * 4, 40));

  const used = new Set(await heroUsedIds());
  const pool = ((data ?? []) as Row[]).map((r) => ({
    ...r,
    photoCount: (r.photos ?? []).length,
  }));
  // Prefer listings the hero has not taken. Falling back only when there are
  // NONE left — not merely fewer than the rail would like. The first version
  // reverted to the whole pool whenever `unused` was short, which put ten of
  // the hero's twenty annonces back into the rails underneath it: a shorter
  // rail is honest, the same car twice on one screen is what this change
  // exists to stop.
  const unused = pool.filter((r) => !used.has(r.id));
  const rows = rankListings(unused.length > 0 ? unused : pool).slice(0, limit);
  if (rows.length === 0) return null;

  // One query for every badge on the rail, not one per card.
  const badged = new Set<string>();
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  if (sellerIds.length > 0) {
    const { data: badges } = await admin
      .from("seller_badges")
      .select("seller_id, expires_at, revoked_at")
      .in("seller_id", sellerIds)
      .is("revoked_at", null);
    const now = Date.now();
    for (const b of badges ?? []) {
      if (new Date(b.expires_at as string).getTime() > now) badged.add(b.seller_id as string);
    }
  }

  const href = `/annonces?kind=${kind}`;

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-3 px-4 lg:px-6">
        <div>
          <span className="batta-eyebrow">{eyebrow}</span>
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight text-foreground lg:text-[22px]">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
        </div>
        <Link
          href={href as never}
          className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-gold hover:underline"
        >
          Tout voir <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-3 lg:hidden">
        <TrendingRail>
          {rows.map((l) => (
            <div key={l.id} className="w-[210px] shrink-0 snap-start">
              <Card listing={l} badged={badged.has(l.seller_id)} locale={locale} />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </TrendingRail>
      </div>

      <div className="mt-3 hidden gap-5 px-6 lg:grid lg:grid-cols-4">
        {rows.slice(0, 8).map((l) => (
          <Card key={l.id} listing={l} badged={badged.has(l.seller_id)} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function Card({
  listing,
  badged,
  locale,
}: {
  listing: Row;
  badged: boolean;
  locale: string;
}) {
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;
  const cover = coverPhoto(listing.photos);

  return (
    <Link
      href={`/annonces/${listing.id}` as never}
      className="press group relative block overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-gold-soft"
    >
      <LinkBusy />
      <div className="relative aspect-[4/3] bg-surface-2">
        {cover ? (
          <ListingImage
            path={cover.storage_path}
            alt={listing.title}
            sizes="260px"
            className="transition group-hover:scale-[1.02]"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted">
            <ImageOff className="size-6" />
          </span>
        )}
        {badged && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            <BadgeCheck className="size-3 text-gold" /> vérifié
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          {cat?.label_fr ?? ""}
        </span>
        <h3 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-foreground">
          {listing.title}
        </h3>
        <p className="batta-tabular mt-1 text-[14px] font-extrabold text-foreground">
          {listing.price_on_request || listing.price == null
            ? "Sur demande"
            : `${formatTND(Number(listing.price), locale)} TND`}
        </p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-muted">
          <MapPin className="size-3" /> {listing.governorate}
        </p>
      </div>
    </Link>
  );
}
