import { Link } from "@/i18n/navigation";
import { coverPhoto } from "@/lib/listingCover";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { BadgeCheck, ImageOff, MapPin } from "lucide-react";
import { LinkBusy } from "@/components/ui/LinkBusy";

/**
 * One annonce as a card: cover, category, title, price, place.
 *
 * Shared by « Annonces similaires » and the shop storefront, so an annonce
 * looks the same wherever it is listed. A rental is priced per day
 * (`price_unit`, 0187) and says so.
 */

export type CardListing = {
  id: string;
  title: string;
  price: number | null;
  price_on_request: boolean;
  price_unit?: string | null;
  governorate: string;
  seller_id: string;
  published_at: string | null;
  attributes: Record<string, unknown> | null;
  category: { label_fr: string } | { label_fr: string }[] | null;
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

export const LISTING_CARD_SELECT = `
  id, title, price, price_on_request, price_unit, governorate, seller_id, published_at, attributes,
  category:categories (label_fr),
  photos:listing_photos (storage_path, sort_order, is_cover)
`;

export function ListingCard({
  listing,
  badged,
  locale,
  sizes = "(min-width:1024px) 260px, 210px",
}: {
  listing: CardListing;
  badged: boolean;
  locale: string;
  sizes?: string;
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
            sizes={sizes}
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
        <h3 className="mt-0.5 line-clamp-2 break-words text-[13px] font-bold leading-snug text-foreground">
          {listing.title}
        </h3>
        <p className="batta-tabular mt-1 text-[14px] font-extrabold text-foreground">
          {listing.price_on_request || listing.price == null
            ? "Sur demande"
            : `${formatTND(Number(listing.price), locale)} TND${listing.price_unit === "day" ? " / jour" : ""}`}
        </p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-muted">
          <MapPin className="size-3" /> {listing.governorate}
        </p>
      </div>
    </Link>
  );
}
