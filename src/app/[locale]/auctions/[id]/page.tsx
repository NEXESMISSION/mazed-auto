import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, Check, Gauge } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SpecsGrid } from "@/components/auction/SpecsGrid";
import { AnonSellerCard } from "@/components/auction/AnonSellerCard";
import { ReportButton } from "@/components/auction/ReportButton";
import { FavoriteButton } from "@/components/auction/FavoriteButton";
import { ShareButton } from "@/components/auction/ShareButton";
import { AuctionEndModal } from "@/components/auction/AuctionEndModal";
import { HeroCarousel } from "@/components/auction/HeroCarousel";
import { DesktopAuctionGallery } from "@/components/auction/DesktopAuctionGallery";
import { LiveAuctionPanel } from "@/components/auction/LiveAuctionPanel";
import { LiveHeroBadge } from "@/components/auction/LiveHeroBadge";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById } from "@/lib/db";
import {
  getSellerPublicPlanPerks,
  getSellerPublicPhone,
} from "@/lib/subscription";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

/**
 * Per-request memoized fetch — `generateMetadata` runs first to build
 * the <head>, then the page component renders the body. Both need the
 * same auction row, and Next.js only auto-dedupes `fetch()` calls (not
 * Supabase RPCs). React.cache wraps the function so the second call
 * inside the same request returns the first call's promise, halving
 * the DB round-trips on every auction-detail page load.
 */
const getCachedAuction = cache(async (id: string) => {
  const supabase = await createClient();
  return getAuctionById(supabase, id);
});

/**
 * Per-auction social-share metadata. Without this, every link shared
 * to Facebook / WhatsApp / Twitter renders the site-default OG card
 * ("Mazed Auto") — useless for catalogue listings where the entire
 * point is "look at THIS car." With it, the link unfurls to the make /
 * model / year, current price, and the first vehicle photo.
 *
 * Two notable choices:
 *   - Auctions in `pending_review` / `scheduled` (non-public) are
 *     intentionally rendered with a generic title and `robots.noindex`
 *     so crawlers don't index pre-launch listings. The page itself
 *     already 404s for non-owners, so this just keeps the SEO surface
 *     consistent.
 *   - The OG image is the same supabase image-transform URL we use for
 *     the cards (1200×630 is Facebook's recommended OG dimensions).
 *     Falls back to /og-default.png if no vehicle image is present.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const auction = await getCachedAuction(id).catch(() => null);

  if (!auction) {
    return {
      title: "Enchère introuvable — Mazed Auto",
      robots: { index: false, follow: false },
    };
  }

  const isAr = locale === "ar";
  const make = auction.vehicle.make ?? "";
  const model = auction.vehicle.model ?? "";
  const year = auction.vehicle.year ?? "";
  const carName = [make, model, year].filter(Boolean).join(" ").trim();

  const title = isAr
    ? `${carName} — مزاد على Mazed Auto`
    : `${carName} — enchère sur Mazed Auto`;

  // The current price is the single most informative datum to show in
  // a share preview ("starts at 25 000 DT" gets clicks, "see car"
  // doesn't). Use starting price for not-yet-active listings and
  // current for everything else.
  const showPrice =
    auction.status === "active" || auction.status === "ending"
      ? auction.currentPrice
      : (auction.startingPrice ?? auction.currentPrice);
  const priceStr = showPrice
    ? formatPrice(showPrice)
    : isAr
      ? "ابدأ المزايدة الآن"
      : "Mise à prix";
  const description = isAr
    ? `${carName} — ${priceStr} · ${auction.vehicle.city ?? ""}`
    : `${carName} — ${priceStr} · ${auction.vehicle.city ?? ""}`;

  // OG image: 1200×630 keeps Facebook / WhatsApp from cropping
  // unpredictably. Without the explicit thumb() call, social platforms
  // would download the original (often 3MB+) and a slow fetch means
  // their preview-bot times out and shows nothing.
  const firstImage = auction.vehicle.imageUrls?.[0];
  const ogImage = firstImage
    ? thumb(firstImage, { width: 1200, height: 630, quality: 80 })
    : "/og-default.png";

  const nonPublic =
    auction.status === "pending_review" || auction.status === "scheduled";

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: carName }],
      locale: isAr ? "ar_TN" : "fr_TN",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: nonPublic ? { index: false, follow: false } : undefined,
  };
}

export default async function AuctionDetailPage({ params }: Props) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: "auctions.detail" });
  const supabase = await createClient();

  // Sweep expired rows before reading so the CTA never lies.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore
  }

  const auction = await getCachedAuction(id);
  if (!auction) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Hide auctions that haven't been admin-approved (or are admin-only
  // pre-launch state) from anyone but the owner / admin. `cancelled`
  // is intentionally NOT hidden here — bidders need to see "this
  // auction was cancelled, your deposit was refunded" pages, and the
  // RLS policy already allows bidders to read their own cancelled
  // rows. Everyone else gets a 404 so the URL doesn't confirm the
  // pre-approval listing exists.
  const NON_PUBLIC_STATUSES = new Set(["pending_review", "scheduled"]);
  if (NON_PUBLIC_STATUSES.has(auction.status)) {
    const role = (user?.user_metadata as { role?: string } | null)?.role;
    const isOwner = Boolean(user && auction.seller.id === user.id);
    const isAdmin = role === "admin";
    if (!isOwner && !isAdmin) notFound();
  }

  let hasBid = false;
  if (user) {
    const { count } = await supabase
      .from("bids")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("auction_id", id);
    hasBid = (count ?? 0) > 0;
  }

  const isOwnAuction = Boolean(user && auction.seller.id === user.id);

  const { vehicle, seller } = auction;

  // Pro plan perks for this seller — drives the trusted-seller badge
  // and (with directPhoneVisible) reveals the verified phone. Both
  // RPCs are public-safe + self-gating: they return null when the
  // seller has no active plan or the plan doesn't grant the perk.
  const [sellerPlanPerks, sellerPhone] = await Promise.all([
    getSellerPublicPlanPerks(seller.id).catch(() => null),
    getSellerPublicPhone(seller.id).catch(() => null),
  ]);

  // ─── JSON-LD structured data (schema.org Car + Offer) ─────────────
  //
  // This is the SEO multiplier: it gives Google enough information to
  // render this listing as a *rich snippet* in search results — the
  // user sees price, availability ("In stock"), photo, and seller
  // before they click. Without it, our auction page competes against
  // dealer sites on a level visual playing field; with it, our listing
  // takes 2-3x the SERP real estate. Schema.org `Car` extends `Vehicle`
  // extends `Product`, so all the Product validators apply.
  //
  // Only emit while the auction is publicly accessible (active/ending);
  // for cancelled/ended/pending states we skip it so dead listings
  // don't pollute Google's freshness signals.
  const isPubliclyBiddable =
    auction.status === "active" || auction.status === "ending";
  const isAr = locale === "ar";
  const carName = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(" ");
  const jsonLd = isPubliclyBiddable
    ? {
        "@context": "https://schema.org",
        "@type": "Car",
        name: carName,
        description:
          vehicle.description ||
          `${carName} en vente aux enchères sur Mazed Auto`,
        image: vehicle.imageUrls?.slice(0, 6) ?? [],
        brand: { "@type": "Brand", name: vehicle.make ?? "" },
        model: vehicle.model ?? undefined,
        vehicleModelDate: vehicle.year
          ? String(vehicle.year)
          : undefined,
        color: vehicle.color ?? undefined,
        vehicleTransmission:
          vehicle.transmission === "automatic"
            ? "AutomaticTransmission"
            : vehicle.transmission === "manual"
              ? "ManualTransmission"
              : undefined,
        fuelType: vehicle.fuelType ?? undefined,
        mileageFromOdometer: vehicle.mileage
          ? { "@type": "QuantitativeValue", value: vehicle.mileage, unitCode: "KMT" }
          : undefined,
        offers: {
          "@type": "Offer",
          // Price is the *current bid* — Google's snippet shows this
          // as the "starting at" amount. priceValidUntil gives the bot
          // a TTL so it knows when to re-crawl.
          price: auction.currentPrice,
          priceCurrency: "TND",
          priceValidUntil: auction.endTime.toISOString().slice(0, 10),
          availability: "https://schema.org/InStock",
          itemCondition:
            vehicle.condition === "new"
              ? "https://schema.org/NewCondition"
              : "https://schema.org/UsedCondition",
          url: `/${locale}/auctions/${auction.id}`,
          seller: {
            "@type": "Person",
            name: seller.displayName || seller.username || "Vendeur",
          },
        },
        ...(vehicle.city
          ? {
              availableAtOrFrom: {
                "@type": "Place",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: vehicle.city,
                  addressCountry: "TN",
                },
              },
            }
          : {}),
        inLanguage: isAr ? "ar-TN" : "fr-TN",
      }
    : null;

  return (
    <AppShell noTopBar>
      {jsonLd && (
        // Inline JSON-LD. Next.js SSRs this as a regular <script> in the
        // <head>; Google's bot parses it without executing JS. Using
        // `dangerouslySetInnerHTML` because React's normal JSX escapes
        // quotes inside strings — for JSON-LD that breaks the spec
        // contract. The content is JSON.stringify'd from our own data,
        // so there's no untrusted-string XSS risk here.
        <script
          type="application/ld+json"
          // Stringify with JSON.stringify so any quote-escaping is correct.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <AuctionEndModal auction={auction} userId={user?.id ?? null} />

      {/* ============================================================
          MOBILE — full-bleed cinematic hero + linear flow.
          Desktop hides this entirely (lg:hidden).
          ============================================================ */}
      <section className="relative lg:hidden">
        <HeroCarousel
          images={vehicle.imageUrls}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="h-[58vh] min-h-[440px] max-h-[560px]"
        >
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />

          <div className="absolute top-4 inset-x-0 px-4 flex items-center justify-between z-20">
            <Link
              href="/auctions"
              aria-label={t("back")}
              className="h-10 w-10 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2 [&_button]:bg-black/45 [&_button]:backdrop-blur-md [&_button]:border-white/15 [&_button]:text-white [&_button]:hover:bg-black/65 [&_button]:hover:border-white/25 [&_button]:hover:text-white">
              <FavoriteButton
                auctionId={auction.id}
                size="md"
                className="bg-black/45 backdrop-blur-md border-white/15 text-white hover:bg-black/65"
              />
              <ShareButton
                title={t("shareTitle", {
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                })}
                text={t("shareText", { price: formatPrice(auction.currentPrice) })}
                className="bg-black/45 backdrop-blur-md border-white/15 text-white hover:bg-black/65 hover:border-white/25 hover:text-white"
              />
              <ReportButton auctionId={auction.id} />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-5 pb-7 z-10">
            <LiveHeroBadge initialAuction={auction} />
            <h1 className="text-white text-[26px] font-extrabold leading-[1.15] tracking-tight">
              {vehicle.make} {vehicle.model}
              <span className="block text-white/70 font-light text-[18px] mt-0.5">
                {vehicle.year}
                {vehicle.color && ` · ${vehicle.color}`}
              </span>
            </h1>
          </div>
        </HeroCarousel>
      </section>

      <div className="lg:hidden px-4 pt-5 pb-4 space-y-5">
        <LiveAuctionPanel
          initialAuction={auction}
          hasBid={hasBid}
          isOwnAuction={isOwnAuction}
          videoUrl={vehicle.videoUrl}
          videoPoster={vehicle.imageUrls[0]}
        />

        {vehicle.description && (
          <p className="text-[13px] leading-relaxed text-[var(--foreground-muted)] line-clamp-3">
            {vehicle.description}
          </p>
        )}

        <Section title={t("specs")}>
          <SpecsGrid vehicle={vehicle} />
        </Section>

        {vehicle.features.length > 0 && (
          <Section title={t("features")}>
            <div className="flex flex-wrap gap-1.5">
              {vehicle.features.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs"
                >
                  <Check className="h-3 w-3 text-[var(--gold)]" />
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title={t("seller")}>
          <AnonSellerCard
            seller={seller}
            planPerks={sellerPlanPerks}
            sellerPhone={sellerPhone}
          />
        </Section>
      </div>

      {/* ============================================================
          DESKTOP — fresh layout. NO full-bleed hero. The page reads
          like a product page: photo gallery + bid panel side-by-side
          on top, full editorial copy underneath. The bid panel sticks
          to the viewport as the user scrolls through the details so
          they can act at any point.

          Layout:
            ┌─────────────────────────────────────────────────────────┐
            │ Breadcrumb · tracking code         [Fav] [Share] [⚠]   │
            ├─────────────────────────────────────────────────────────┤
            │  Title (large)                                          │
            │  year · color · mileage                                 │
            ├──────────────────────────┬──────────────────────────────┤
            │                          │                              │
            │  Photo gallery (4:3)     │  Live bid panel (sticky)     │
            │  + thumb strip           │  status / price / countdown  │
            │                          │  [BID NOW]                   │
            │  Description             │  trust signals               │
            │  Specs                   │                              │
            │  Features                │                              │
            │  Seller                  │                              │
            │                          │                              │
            └──────────────────────────┴──────────────────────────────┘
          ============================================================ */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10">
        {/* Top utility row — back link + tracking code + actions */}
        <div className="flex items-center justify-between gap-4 mb-7">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/auctions"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("catalog")}
            </Link>
            <div className="hidden xl:flex items-center gap-2 text-[11px] text-[var(--foreground-muted)] uppercase tracking-[0.18em] font-bold">
              <span>{t("auctionLabel")}</span>
              <span className="text-[var(--border-strong)]">·</span>
              <span className="font-mono tabular-nums text-[var(--foreground-subtle)]">
                {auctionCode(auction.id)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <FavoriteButton
              auctionId={auction.id}
              size="md"
              className="bg-[var(--surface)] border-[var(--border)] text-foreground hover:border-[var(--gold-soft)]"
            />
            <ShareButton
              title={t("shareTitle", {
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
              })}
              text={t("shareText", { price: formatPrice(auction.currentPrice) })}
              className="bg-[var(--surface)] border-[var(--border)] text-foreground hover:border-[var(--gold-soft)]"
            />
            <ReportButton auctionId={auction.id} />
          </div>
        </div>

        {/* Title block — full width, magazine-style. Sits above the
            split so the user reads "what" before "what next". */}
        <div className="mb-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)] mb-3">
            {vehicle.make}
          </div>
          <h1 className="text-5xl xl:text-6xl font-black tracking-tight leading-[1.02]">
            {vehicle.model}{" "}
            <span className="text-[var(--foreground-muted)] font-light">
              {vehicle.year}
            </span>
          </h1>
          <div className="mt-4 flex items-center gap-4 text-[15px] text-[var(--foreground-muted)] flex-wrap">
            {vehicle.color && (
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
                {vehicle.color}
              </span>
            )}
            {vehicle.mileage > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-[var(--gold)]" />
                {Intl.NumberFormat("fr-TN").format(vehicle.mileage)} km
              </span>
            )}
            {vehicle.city && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--foreground-muted)]" />
                {vehicle.city}
              </span>
            )}
          </div>
        </div>

        {/* 2-col split: gallery + editorial on the start, sticky live
            panel on the end. The grid items align to start so the
            sticky panel can stick to the top of its column instead of
            being stretched to match the editorial column's height. */}
        <div className="grid grid-cols-[1fr_440px] xl:grid-cols-[1fr_460px] gap-12 xl:gap-14 items-start">
          {/* ── Editorial column ── */}
          <main className="space-y-12 min-w-0">
            <DesktopAuctionGallery
              images={vehicle.imageUrls}
              alt={`${vehicle.make} ${vehicle.model}`}
            />

            {vehicle.description && (
              <section>
                <SectionEyebrow>{t("about")}</SectionEyebrow>
                <p className="mt-5 text-[17px] leading-[1.75] text-foreground/90 whitespace-pre-line">
                  {vehicle.description}
                </p>
              </section>
            )}

            <section>
              <SectionEyebrow>{t("specs")}</SectionEyebrow>
              <div className="mt-5">
                <SpecsGrid vehicle={vehicle} />
              </div>
            </section>

            {vehicle.features.length > 0 && (
              <section>
                <SectionEyebrow>{t("features")}</SectionEyebrow>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {vehicle.features.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)] text-sm font-semibold hover:ring-[var(--gold-soft)] hover:text-[var(--gold-bright)] transition-colors"
                    >
                      <Check className="h-4 w-4 text-[var(--gold)]" />
                      {f}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionEyebrow>{t("seller")}</SectionEyebrow>
              <div className="mt-5">
                <AnonSellerCard
            seller={seller}
            planPerks={sellerPlanPerks}
            sellerPhone={sellerPhone}
          />
              </div>
            </section>
          </main>

          {/* ── Live bid panel — sticks while user scrolls editorial ── */}
          <LiveAuctionPanel
            initialAuction={auction}
            hasBid={hasBid}
            videoUrl={vehicle.videoUrl}
            videoPoster={vehicle.imageUrls[0]}
          />
        </div>
      </div>
    </AppShell>
  );
}

/** Mobile section heading. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Desktop section heading — gold eyebrow + hairline. */
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="text-xs uppercase tracking-[0.24em] font-extrabold text-[var(--gold)] shrink-0">
        {children}
      </h2>
      <span
        aria-hidden
        className="flex-1 h-px bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent"
      />
    </div>
  );
}
