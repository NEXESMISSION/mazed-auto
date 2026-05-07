import { redirect } from "@/i18n/navigation";

// Per product decision: the auctions list is the landing experience, not
// a curated home page. The locale-aware redirect produces /fr/auctions or
// /ar/auctions depending on the resolved locale (so we don't fight the
// middleware). Redirect is a 308 — bookmarks for "/" still work, they
// just always land on /auctions.
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/auctions", locale: locale as "ar" | "fr" });
}
