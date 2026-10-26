import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchListing } from "./fetchListing";

/**
 * Decides the 404 BEFORE the page's skeleton. A layout renders outside its own
 * segment's loading.tsx, so throwing notFound() here happens before anything is
 * sent: a deleted, expired or mistyped annonce answers a real 404 (in the
 * visitor's language, with the site's bars) instead of the skeleton followed
 * by « not found » under a 200. The read is shared with the page (cache()).
 *
 * Router prefetches skip it: the catalogue prefetches every card that scrolls
 * into view, and each prefetch renders this layout down to the skeleton. The
 * page still checks when the annonce is actually opened.
 */
export default async function AnnonceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  if ((await headers()).get("next-router-prefetch") === "1") return children;
  const { id } = await params;
  const listing = await fetchListing(id);
  if (!listing || listing.status !== "published") notFound();
  return children;
}
