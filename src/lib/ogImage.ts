import { LOGO } from "@/lib/brand";

/**
 * The site's social preview: the full logo on --background, 1200x630
 * (public/brand/<version>/og.jpg, built by scripts/regen-logos.mjs).
 *
 * Next.js replaces `openGraph` wholesale when a layout or page sets its own,
 * so every one that does must list `images` again, or links to it are shared
 * with no picture at all.
 */
export const OG_IMAGE = {
  url: LOGO.og.src,
  width: LOGO.og.width,
  height: LOGO.og.height,
  alt: "Mazed Auto — Petites annonces automobiles en Tunisie",
};
