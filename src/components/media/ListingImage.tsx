import Image from "next/image";
import { propertyPhotoUrl } from "@/lib/imageUrl";

/**
 * A listing photo: whole, sharp, and served at the size it is displayed.
 *
 * Three problems, one component.
 *
 * SIZE. The v3 surfaces were built with raw `<img src={propertyPhotoUrl(...)}>`,
 * which sends the browser straight to Supabase for the original file. Measured
 * on the catalog: 1280px images decoded into 166px boxes, ~79KB each, ~2MB for
 * one screen of cards. next/image resizes to the requested width and negotiates
 * AVIF, taking the same photo to ~3KB. `sizes` is what decides which variant is
 * generated, so every caller passes the width it really occupies.
 *
 * CROPPING. Sellers shoot cars both ways. A portrait phone photo cropped to
 * fill a 4/3 card loses the roof and the wheels, and the buyer never learns
 * what they did not see — the wrong trade for a photo of the thing being sold.
 * So the photo is CONTAINED: all of it, always.
 *
 * THE GAPS. Containing on flat black turned every card into a black slab with a
 * small picture floating in it, and no two cards looked alike. So the leftover
 * space is filled with a blurred, over-scaled copy of the same photo — the
 * trick every serious classifieds site uses. Nothing is cropped, nothing is
 * dead space, and the card reads as one image. The backdrop is fetched at 64px
 * (about 1KB): it is blurred past recognition, so a larger one would only cost
 * bandwidth.
 *
 * **The parent must be positioned** — `relative`, `absolute` or `fixed`.
 * Every layer here is `<Image fill>`, which is `position:absolute; inset:0`,
 * so without a positioned ancestor the photo resolves against the initial
 * containing block and covers the whole page instead of its box. It fails
 * silently: no error, no warning, just one listing thumbnail rendered at
 * viewport size on top of everything else. That is exactly what happened on
 * /account/listings and /account/favoris, where the wrapper was
 * `size-[74px] shrink-0 overflow-hidden …` with no `relative`.
 */

export function ListingImage({
  path,
  alt,
  sizes,
  priority = false,
  className = "",
  quality = 72,
  fit = "contain",
}: {
  /** `storage_path` from listing_photos — absolute URL or bucket-relative. */
  path: string;
  alt: string;
  /** The CSS width this image occupies, e.g. "(min-width:1024px) 25vw, 50vw". */
  sizes: string;
  /** Only for what is above the fold; everything else stays lazy. */
  priority?: boolean;
  className?: string;
  quality?: number;
  /**
   * "contain" (default) shows the whole photo over a blurred fill.
   * "cover" fills the frame and crops — for decoration only (the hero's own
   * blurred backdrop), never for a photo someone is trying to look at.
   */
  fit?: "contain" | "cover";
}) {
  const src = propertyPhotoUrl(path);

  if (fit === "cover") {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className={`object-cover${className ? ` ${className}` : ""}`}
        draggable={false}
      />
    );
  }

  return (
    <>
      {/* Fill layer — same photo, tiny and blurred, cropped to cover. Purely
          decorative: the sharp copy above carries the alt text. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes="64px"
        // 50, not a lower number: next.config's `images.qualities` allowlist
        // rejects anything not listed, and an unlisted quality is a 400 rather
        // than a smaller file.
        quality={50}
        loading="lazy"
        className="scale-125 object-cover blur-xl brightness-[0.55] saturate-150"
        draggable={false}
      />
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className={`object-contain${className ? ` ${className}` : ""}`}
        draggable={false}
      />
    </>
  );
}
