import { redirect } from "@/i18n/navigation";

/**
 * /buyer/wins is folded into /buyer/bids → "Gagnées" tab. We keep the
 * URL alive so existing notifications / emails / bookmarks still work,
 * but every visit just redirects to the consolidated page.
 *
 * The supporting bits used by the won tab (RenounceButton, the
 * server-action `renounce`) still live under this folder and are
 * imported from BidsTabs.
 */
export default async function BuyerWinsRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/buyer/bids", locale });
}
