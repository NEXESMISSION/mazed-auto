import { redirect } from "@/i18n/navigation";

/**
 * /buyer/watchlist is folded into /buyer/bids → "Favoris" tab. The URL
 * stays alive so existing notifications, share links and bookmarks keep
 * working — the redirect lands the user directly on the right tab.
 */
export default async function BuyerWatchlistRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/buyer/bids?tab=watchlist", locale });
}
