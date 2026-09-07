import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BrandRail } from "@/components/landing/BrandRail";
import { AnnonceRail } from "@/components/landing/AnnonceRail";
import { AnnonceHero } from "./AnnonceHero";
import { ArrowUpRight, Gavel, Tag } from "lucide-react";

/**
 * Desktop (lg+) home surface. The signature piece is the cinematic
 * MAGAZINE HERO at the top — 1 large featured lot + 3 stacked runner
 * cards over a blurred-photo backdrop — ported from the original
 * mazed-auto home (see DesktopHero.tsx). Below it the feed is grouped
 * by editorial SECTION DIVIDERS ("Enchères en direct" vs "Récemment
 * vendues") just like v1, each listing surface is an AUTO-SLIDING
 * carousel, and the page closes on the twin-pillar buyers/sellers CTA.
 *
 * Kept in its own file so the mobile tree in the route's page.tsx is
 * never touched; rendered behind `hidden lg:block`, so it costs nothing
 * on phones.
 */



export async function HomeDesktop({
  makeCounts = [],
  alwaysVisible = false,
}: {
  /** Published-annonce count per make, for "Parcourir par marque". Resolved by
   *  the page with one cached query over `listings.attributes->>make` rather
   *  than derived here by splitting lot TITLES on their first word — see the
   *  note where the old derivation stood. */
  makeCounts?: { name: string; count: number }[];
  /** When true the root drops its `hidden lg:block` gate and renders at
   *  all widths — set by the home page when it has already decided (via
   *  UA) to send only the desktop tree. */
  alwaysVisible?: boolean;
}) {
  const t = await getTranslations();
  const locale = await getLocale();

  // Five arrays were derived here from the auction feed: `hotNow` (by bid
  // count), `lastCall` (hammer within the hour), `vip`
  // (`property.promo_home_featured`), `heroPool`, and `topMakes` — the last of
  // which counted makes by splitting each lot TITLE on its first word.
  //
  // All five fed rails that `AUCTIONS_VISIBLE` had switched off, from tables
  // empty since the pivot. The one that still earns its place, the make counts,
  // is a real query over `listings.attributes->>make` now, resolved by the page
  // — the same field the catalogue filters on, so the badge and the results
  // agree.
  const topMakes = makeCounts.slice(0, 12);

  // `PROPERTY_TYPES` and `PRICE_BUCKETS` stood here, feeding "Parcourir par
  // type" and "Parcourir par prix" — both inside the block AUCTIONS_VISIBLE
  // had switched off, so neither has rendered for some time. They are worth
  // rebuilding against the catalogue's own categories and price ranges, which
  // is a feature rather than part of a deletion.

  return (
    <div className={alwaysVisible ? "block" : "hidden lg:block"}>
      {/* ─── CINEMATIC MAGAZINE HERO — full-bleed, 1 featured + 3 runners ───
          The v3 cover: same spread, drawn from the annonces catalog. It
          replaces DesktopHero, which spoke in countdowns and bid counts and
          went dark with the auction blocks — taking the whole top of the page
          with it. AnnonceHero renders BOTH trees (it owns the mobile carousel
          too), so this instance is desktop-only via its own breakpoints. */}
      <AnnonceHero />

      {/* ── v2 AUCTION BLOCKS (desktop) ──
          Hidden with AUCTIONS_VISIBLE, same as the mobile tree: the hero,
          the ticker, every bid rail, "Les voitures à miser" and the sold-lot
          proof strip. What survives below is what still describes the
          product — the brand rail, the trust strip and the footer.
          Phase 6 deletes this file along with the rest of the auction UI. */}
      

        {/* Everything below the hero stays in the constrained content column. */}
        <div className="mx-auto max-w-[var(--max-w-wide)] px-8 pb-24">
        {/* The v3 catalog on desktop. The home page's own rails live inside its
            lg:hidden tree, so they never reach this breakpoint. */}
        <AnnonceRail
          kind="vehicle"
          eyebrow="À vendre"
          title="Voitures à prix fixe"
          subtitle="Vous contactez le vendeur directement"
          locale={locale}
        />
        <AnnonceRail
          kind="part"
          eyebrow="Pièces de rechange"
          title="Pièces disponibles"
          subtitle="Trouvez la pièce compatible avec votre véhicule"
          locale={locale}
        />

        

      {/* PARCOURIR PAR MARQUE — make chips */}
      {topMakes.length > 0 && (
        <BrandRail makes={topMakes} title="Parcourir par marque" />
      )}

        {/* ─── CLOSING CTA — twin pillars (buyers / sellers) ─── */}
        <section className="mt-16">
          <div className="grid grid-cols-2 gap-6">
            <CtaPillar
              href="/properties"
              Icon={Gavel}
              eyebrow="Acheteurs"
              title="Trouvez votre prochaine voiture"
              text="Des annonces vérifiées chaque jour, partout en Tunisie — voitures et pièces de rechange."
              cta="Parcourir tout"
              tone="gold"
            />
            <CtaPillar
              href="/sell"
              Icon={Tag}
              eyebrow="Vendeurs"
              title="Vendez votre voiture en toute confiance"
              text="Votre annonce vérifiée et publiée rapidement. Paiement sécurisé à la vente."
              cta="Commencer à vendre"
              tone="dark"
            />
          </div>
        </section>

        {/* FOOTER */}
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <Link href={"/how-it-works" as never} className="hover:text-gold-bright">
              Comment ça marche
            </Link>
            <span className="text-subtle">·</span>
            <Link href={"/help" as never} className="hover:text-gold-bright">
              Aide
            </Link>
            <span className="text-subtle">·</span>
            <Link href={"/about" as never} className="hover:text-gold-bright">
              À propos
            </Link>
            <span className="text-subtle">·</span>
            <Link href="/terms" className="hover:text-gold-bright">
              {t("landing.footerLinks.terms")}
            </Link>
            <span className="text-subtle">·</span>
            <Link href="/privacy" className="hover:text-gold-bright">
              {t("landing.footerLinks.privacy")}
            </Link>
            <span className="text-subtle">·</span>
            <Link href="/contact" className="hover:text-gold-bright">
              {t("landing.footerLinks.contact")}
            </Link>
            <span className="text-subtle">·</span>
            <span className="text-subtle">© {new Date().getFullYear()} {t("brand.name")}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Editorial section divider — gradient hairline → icon chip → eyebrow
 *  (live = emerald pulse / sold = muted) → big title → subtitle. Ported
 *  from v1's desktop HomeSectionDivider. */
/** Section header — eyebrow + title + count chip + "see all" link. */
/** Auto-sliding property carousel (wraps the shared TrendingRail). */
/** Compact "sold for X" card for the Récemment vendues grid. */
/** Closing twin-pillar CTA card (buyers / sellers). Ported from v1's
 *  DesktopFinalCta. */
function CtaPillar({
  href,
  Icon,
  eyebrow,
  title,
  text,
  cta,
  tone,
}: {
  href: "/properties" | "/sell";
  Icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  tone: "gold" | "dark";
}) {
  return (
    <Link
      href={href}
      className={`group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] p-9 ring-1 transition-all xl:p-10 ${
        tone === "gold"
          ? "bg-gradient-to-br from-[#1a1409] via-[#0a0a0a] to-black ring-gold/30 hover:ring-gold"
          : "bg-surface ring-border hover:ring-gold"
      }`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-50 ${
          tone === "gold" ? "bg-gold" : "bg-white/15"
        }`}
      />
      <div className="relative">
        <div
          className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] ${
            tone === "gold" ? "text-gold" : "text-muted"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h3 className="mt-3 max-w-md text-3xl font-black leading-tight tracking-tight xl:text-[34px]">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{text}</p>
      </div>
      <div className="relative mt-8">
        <span
          className={`inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-extrabold transition-transform group-hover:scale-[1.03] active:scale-[0.99] ${
            tone === "gold"
              ? "bg-gold text-black shadow-[var(--shadow-gold)]"
              : "bg-foreground text-black"
          }`}
        >
          {cta}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

/** Inline car-category glyph for the "Parcourir" tiles. */