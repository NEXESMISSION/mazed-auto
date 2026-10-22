import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { jsonLdSafe } from "@/lib/jsonld";
import { SHOP_PUBLIC_SELECT, shopMediaUrl, shopViewer, type PublicShop } from "@/lib/shops/public";
import {
  activityLabel,
  isShopVerified,
  openingHoursRows,
  openingHoursSpec,
  shopInitials,
  shopSchemaType,
} from "@/lib/shops/format";
import { siteUrl } from "@/lib/siteUrl";
import { ListingCard, LISTING_CARD_SELECT, type CardListing } from "@/components/listing/ListingCard";
import { ContactReveal } from "../../annonces/[id]/ContactReveal";
import { ShopsPreviewBanner } from "../ShopsPreviewBanner";
import { ShopViewTracker } from "@/components/shops/ShopViewTracker";
import { ArrowLeft, BadgeCheck, Clock, MapPin, Store } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Une boutique — its storefront.
 *
 * What a visitor may see of the shop (SHOP_PUBLIC_SELECT) and every annonce it
 * has live. The same annonces are in the public catalogue too (recette 9):
 * this page lists them, it does not own them. The phone is not in the HTML —
 * « Afficher le numéro » asks /api/boutiques/[slug]/contact, which throttles
 * per device with the same bucket as annonces.
 *
 * The « vérifiée » badge appears only when an admin verified the business
 * (`verification_status`, 0185) — never because the shop pays for a plan.
 */

async function fetchShop(slug: string): Promise<PublicShop | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("shops")
    .select(SHOP_PUBLIC_SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return (data as unknown as PublicShop | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // The head is rendered even when the page is a 404: without the gate here, a
  // hidden shop's name and description would ship in <title> and <meta>.
  const admin = getServiceSupabase();
  const shop = admin ? await fetchShop(slug) : null;
  if (!admin || !shop || !(await shopViewer(admin, shop.id))) return { title: "Boutique" };
  const title = `${shop.name} — ${activityLabel(shop.activity_type)} · Mazed Auto`;
  const description =
    shop.description?.slice(0, 160)
    ?? `${shop.name}, ${activityLabel(shop.activity_type).toLowerCase()} à ${shop.governorate}. Annonces et contact.`;
  const picture = shopMediaUrl(shop.banner_path) ?? shopMediaUrl(shop.logo_path);
  const url = `${siteUrl()}/fr/boutiques/${shop.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "Mazed Auto", locale: "fr_TN", ...(picture ? { images: [picture] } : {}) },
  };
}

export default async function BoutiquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = getServiceSupabase();
  if (!admin) notFound();
  const shop = await fetchShop(slug);
  if (!shop) notFound();
  // Public once shop pages are open; before that, admins and the shop's own
  // members only — everyone else gets the same not-found as a missing shop.
  const viewer = await shopViewer(admin, shop.id);
  if (!viewer) notFound();
  const locale = await getLocale();

  const { data } = await admin
    .from("listings")
    .select(LISTING_CARD_SELECT)
    .eq("shop_id", shop.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(120);
  const listings = (data ?? []) as unknown as CardListing[];

  const verified = isShopVerified(shop);
  const logo = shopMediaUrl(shop.logo_path);
  const banner = shopMediaUrl(shop.banner_path);
  const hours = openingHoursRows(shop.opening_hours);
  const place = [shop.address, shop.city, shop.governorate].filter(Boolean).join(", ");

  // What a search engine files this page as. No telephone, on purpose: the
  // number is revealed on request only, and JSON-LD is the easiest thing on a
  // page to scrape.
  const site = siteUrl();
  const url = `${site}/fr/boutiques/${shop.slug}`;
  const hoursSpec = openingHoursSpec(shop.opening_hours);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": shopSchemaType(shop.activity_type),
    "@id": `${url}#shop`,
    url,
    name: shop.name,
    description: shop.description ?? undefined,
    logo: logo ?? undefined,
    image: banner ?? logo ?? undefined,
    address: {
      "@type": "PostalAddress",
      addressRegion: shop.governorate,
      addressLocality: shop.city ?? undefined,
      streetAddress: shop.address ?? undefined,
      addressCountry: "TN",
    },
    ...(hoursSpec.length ? { openingHoursSpecification: hoursSpec } : {}),
    ...(listings.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: `Annonces de ${shop.name}`,
            itemListElement: listings.slice(0, 30).map((l) => ({
              "@type": "Offer",
              url: `${site}/fr/annonces/${l.id}`,
              priceCurrency: "TND",
              ...(l.price != null && !l.price_on_request ? { price: Number(l.price) } : {}),
              itemOffered: { "@type": "Product", name: l.title },
            })),
          },
        }
      : {}),
  };

  return (
    <main className="mx-auto max-w-5xl pb-16 lg:px-8 lg:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} />
      <ShopViewTracker slug={shop.slug} />

      {viewer !== "public" && (
        <div className="px-4 pt-4 lg:px-0 lg:pt-0">
          <ShopsPreviewBanner who={viewer} />
        </div>
      )}

      {/* Banner and identity */}
      <section className="overflow-hidden border-border bg-surface lg:rounded-2xl lg:border">
        <div className="relative h-32 bg-gradient-to-br from-surface-2 to-surface sm:h-44">
          {banner && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={banner} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="px-4 pb-5 lg:px-6">
          {/* Above the banner: the banner is positioned, so without its own
              stacking context the logo's top half would sit behind it. */}
          <div className="relative z-10 -mt-10 flex items-end gap-3">
            <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 text-[24px] font-black text-foreground/70 ring-4 ring-surface">
              {logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logo} alt={shop.name} className="size-full object-cover" />
              ) : (
                shopInitials(shop.name)
              )}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-black tracking-tight lg:text-[28px]">{shop.name}</h1>
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-faint px-2.5 py-1 text-[11px] font-extrabold text-gold ring-1 ring-gold-soft">
                <BadgeCheck className="size-3.5" /> Boutique vérifiée
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1 font-bold">
              <Store className="size-3.5" /> {activityLabel(shop.activity_type)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {place}
            </span>
          </p>
          {shop.description && (
            <p className="mt-3 max-w-3xl whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/85">
              {shop.description}
            </p>
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-5 px-4 lg:grid-cols-[1fr_300px] lg:px-0">
        {/* The annonces */}
        <section className="order-2 lg:order-1">
          <h2 className="text-[16px] font-extrabold">
            {listings.length} annonce{listings.length > 1 ? "s" : ""} en ligne
          </h2>
          {listings.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-border bg-surface p-6 text-center text-[13px] text-muted">
              Cette boutique n&apos;a pas d&apos;annonce en ligne pour le moment.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listings.map((l) => (
                <li key={l.id}>
                  <ListingCard
                    listing={l}
                    badged={verified}
                    locale={locale}
                    sizes="(min-width:1024px) 220px, 45vw"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Contact and hours */}
        <aside className="order-1 space-y-3 lg:order-2">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-[13px] font-extrabold">Contacter la boutique</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Vous traitez directement avec la boutique : Mazed n&apos;intervient pas dans la vente
              ni dans la location.
            </p>
            <div className="mt-3">
              <ContactReveal
                endpoint={`/api/boutiques/${shop.slug}/contact`}
                trackWhatsApp={`/api/boutiques/${shop.slug}/event`}
              />
            </div>
          </section>

          {hours.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="inline-flex items-center gap-1.5 text-[13px] font-extrabold">
                <Clock className="size-3.5" /> Horaires
              </h2>
              <dl className="mt-2 space-y-1 text-[12.5px]">
                {hours.map((h) => (
                  <div key={h.day} className="flex justify-between gap-3">
                    <dt className="text-muted">{h.day}</dt>
                    <dd className="font-bold text-foreground">{h.hours}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <Link
            href={"/boutiques" as never}
            className="inline-flex items-center gap-1 text-[12.5px] font-bold text-gold hover:underline"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> Toutes les boutiques
          </Link>
        </aside>
      </div>
    </main>
  );
}
