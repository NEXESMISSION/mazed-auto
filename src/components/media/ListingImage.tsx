import Image from "next/image";
import { propertyPhotoUrl } from "@/lib/imageUrl";

/**
 * A listing photo, served at the size it is actually displayed.
 *
 * The v3 surfaces were built with raw `<img src={propertyPhotoUrl(...)}>`,
 * which sends the browser straight to Supabase for the original file. Measured
 * on the catalog: **1280px webp images decoded into 166px boxes** — about sixty
 * times the pixels needed, ~79KB each, ~2MB for one screen of cards. That is
 * the "images are slow" everyone was feeling; the files were never the problem.
 *
 * Going through next/image fixes it without touching the stored files or
 * asking a seller to upload anything differently: the optimizer resizes to the
 * requested width, negotiates AVIF (~25-30% under webp), and caches the variant
 * for 30 days (next.config.ts). A 166px card drops from ~79KB to a few KB.
 *
 * `sizes` is the whole game — it is what tells the optimizer which width to
 * generate. Every caller passes the CSS width the image really occupies, so a
 * thumbnail never fetches a hero-sized variant.
 *
 * Photos are CONTAINED, not cropped. Sellers shoot cars both ways — a portrait
 * phone photo in a 4/3 card loses the roof and the wheels, and the buyer never
 * knows what they did not see. Black bars are honest about the frame; a crop
 * silently hides part of the thing being sold. `fit="cover"` stays available
 * for decoration (the blurred hero backdrop), never for a photo someone is
 * looking at.
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
   * "contain" (default) shows the WHOLE photo, letterboxed on black.
   * "cover" fills the frame and crops — only for decoration, never for a
   * photo someone is trying to look at.
   */
  fit?: "contain" | "cover";
}) {
  return (
    <Image
      src={propertyPhotoUrl(path)}
      alt={alt}
      fill
      sizes={sizes}
      quality={quality}
      priority={priority}
      // Lazy by default; `priority` already implies eager when set.
      loading={priority ? undefined : "lazy"}
      // `bg-black` on the image itself paints the bars: the element fills the
      // frame while the picture is letterboxed inside it, so the gaps are
      // black without every caller having to colour its own container.
      className={
        (fit === "contain" ? "object-contain bg-black" : "object-cover") +
        (className ? ` ${className}` : "")
      }
      draggable={false}
    />
  );
}
