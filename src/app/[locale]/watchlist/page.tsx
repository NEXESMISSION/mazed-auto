import { redirect } from "@/i18n/navigation";

/**
 * Legacy /watchlist. Kept as a redirect so old links, bookmarks and
 * back-button history don't 404 — it now lands on /account/favoris, which
 * lists saved ANNONCES. The old destination was a tab of the auction activity
 * hub and could not show them.
 */
export default async function WatchlistRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/account/favoris", locale: locale as "ar" | "fr" | "en" });
}
