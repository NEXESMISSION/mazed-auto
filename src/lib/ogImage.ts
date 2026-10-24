/**
 * The site's social preview: the full logo on --background, 1200x630
 * (public/brand/og.jpg, built by scripts/regen-logos.mjs).
 *
 * Next.js replaces `openGraph` wholesale when a layout or page sets its own,
 * so every one that does must list `images` again, or links to it are shared
 * with no picture at all.
 */
export const OG_IMAGE = {
  url: "/brand/og.jpg",
  width: 1200,
  height: 630,
  alt: "Mazed Auto — Petites annonces automobiles en Tunisie",
};
