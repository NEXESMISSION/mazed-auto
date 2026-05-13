import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import type { CmsBanner as CmsBannerRow } from "@/lib/cms";

/**
 * Top-of-home banner driven by /admin/cms/promos. Renders the
 * highest-priority active banner; omits the section entirely when
 * the CMS table has no live row for the current locale.
 */
export function CmsBanner({
  banner,
  locale,
}: {
  banner: CmsBannerRow | null;
  locale: string;
}) {
  if (!banner) return null;
  const isAr = locale === "ar";
  const title = isAr ? banner.titleAr ?? banner.titleFr : banner.titleFr ?? banner.titleAr;
  const subtitle = isAr
    ? banner.subtitleAr ?? banner.subtitleFr
    : banner.subtitleFr ?? banner.subtitleAr;
  const ctaLabel = isAr
    ? banner.ctaLabelAr ?? banner.ctaLabelFr
    : banner.ctaLabelFr ?? banner.ctaLabelAr;

  if (!title) return null;

  const Body = (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-[var(--gold)]/40">
      {banner.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/85 via-black/55 to-black/20" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-tr from-[var(--gold-faint)] via-black to-black" />
      )}
      <div className="relative aspect-[21/9] sm:aspect-[24/7] p-5 sm:p-7 flex flex-col justify-end">
        {/* Ad-disclosure chip — small, non-distracting, but unambiguous so
            users can tell sponsored content apart from editorial. Tunisian
            consumer-protection guidance + EU-style honesty. */}
        <span className="absolute top-3 start-3 inline-flex items-center h-5 px-1.5 rounded-[4px] bg-black/55 text-[9px] uppercase tracking-[0.18em] font-extrabold text-white/85 ring-1 ring-white/15 backdrop-blur-md">
          Publicité
        </span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white max-w-[80%]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-white/80 max-w-[80%]">{subtitle}</p>
        )}
        {ctaLabel && (
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--gold)] w-fit">
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section className="px-4 mt-4">
      {banner.ctaHref ? (
        <Link href={banner.ctaHref}>{Body}</Link>
      ) : (
        Body
      )}
    </section>
  );
}
