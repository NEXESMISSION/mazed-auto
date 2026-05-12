"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Crown,
  Sparkles,
  Star,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CmsPlan } from "@/lib/cms";
import { formatPrice } from "@/lib/format";
import { SubscribeButton } from "./SubscribeButton";

/** Mobile-only plan card. Compact by default, full feature list behind
 *  a "Voir tous les avantages" toggle. Designed to be stacked vertically
 *  full-width on phones — no carousel swipe required. */
export function MobilePlanCard({
  plan,
  locale,
  signedIn,
  isCurrent,
  hasOtherPlan,
}: {
  plan: CmsPlan;
  locale: string;
  signedIn: boolean;
  isCurrent: boolean;
  hasOtherPlan: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const name = locale === "ar" ? plan.nameAr ?? plan.nameFr : plan.nameFr;
  const tagline =
    locale === "ar"
      ? plan.taglineAr ?? plan.taglineFr
      : plan.taglineFr ?? plan.taglineAr;

  const tone = badgeToneStyles(plan.badgeTone);
  const ToneIcon =
    plan.badgeTone === "diamond"
      ? Sparkles
      : plan.badgeTone === "gold"
        ? Crown
        : plan.badgeTone === "silver"
          ? Star
          : Sparkles;

  // Top 4 marketing bullets shown when collapsed. Picked for impact.
  const topBullets = pickTopBullets(plan);
  const remainingBullets = pickRemainingBullets(plan, locale, topBullets);
  const hasMore = remainingBullets.length > 0;

  return (
    <article
      className={`relative rounded-[20px] border-2 ${tone.border} ${tone.bg} overflow-hidden`}
    >
      {plan.badgeTone === "gold" && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 bg-[var(--gold)] text-black text-[9px] uppercase tracking-[0.18em] font-extrabold px-2 py-0.5 rounded-full">
            <Star className="h-2.5 w-2.5" fill="currentColor" />
            Recommandé
          </span>
        </div>
      )}

      <div className="p-4 space-y-3.5">
        {/* Header — icon chip + name + tagline */}
        <div className="flex items-start gap-3">
          <span
            className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${tone.iconBg}`}
          >
            <ToneIcon className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <div
              className={`text-[11px] uppercase tracking-[0.2em] font-extrabold ${tone.accent}`}
            >
              {name}
            </div>
            {tagline && (
              <div className="text-[13px] text-[var(--foreground-muted)] mt-0.5 leading-snug">
                {tagline}
              </div>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-black tabular-nums leading-none">
            {formatPrice(plan.monthlyPrice)}
          </span>
          <span className="text-[11px] text-[var(--foreground-muted)] font-semibold">
            / mois
          </span>
        </div>

        {/* Top bullets — always shown */}
        <ul className="space-y-1.5 text-[13px]">
          {topBullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check
                className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5"
                strokeWidth={2.5}
              />
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        {/* Expand/collapse for remaining bullets */}
        {hasMore && (
          <>
            <div
              className={`grid transition-[grid-template-rows] duration-200 ${
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <ul className="space-y-1.5 text-[13px] pt-1">
                  {remainingBullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check
                        className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5"
                        strokeWidth={2.5}
                      />
                      <span className="leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-[var(--gold)] hover:text-[var(--gold-bright)] transition-colors"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded
                ? "Voir moins"
                : `Voir tous les avantages (+${remainingBullets.length})`}
            </button>
          </>
        )}

        {/* CTA */}
        <div className="pt-2">
          {!signedIn ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 w-full h-12 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors text-[13px] font-semibold"
            >
              Connectez-vous pour souscrire
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : isCurrent ? (
            <div className="inline-flex items-center justify-center gap-1.5 w-full h-12 rounded-[var(--radius)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 text-[13px] font-bold text-[var(--gold-bright)]">
              <Check className="h-4 w-4" />
              Plan actuel
            </div>
          ) : (
            <SubscribeButton
              planSlug={plan.slug}
              planName={name}
              monthlyPrice={plan.monthlyPrice}
              bullets={topBullets}
              mode={hasOtherPlan ? "switch" : "subscribe"}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function badgeToneStyles(tone: CmsPlan["badgeTone"]) {
  switch (tone) {
    case "diamond":
      return {
        border: "border-cyan-500/40",
        bg: "bg-gradient-to-br from-cyan-500/5 to-[var(--surface)]",
        iconBg: "bg-cyan-500/15 text-cyan-300",
        accent: "text-cyan-300",
      };
    case "gold":
      return {
        border: "border-[var(--gold)]",
        bg: "bg-gradient-to-br from-[var(--gold-faint)] to-[var(--surface)]",
        iconBg: "bg-[var(--gold)] text-black",
        accent: "text-[var(--gold)]",
      };
    case "silver":
      return {
        border: "border-slate-400/40",
        bg: "bg-gradient-to-br from-slate-400/5 to-[var(--surface)]",
        iconBg: "bg-slate-400/15 text-slate-200",
        accent: "text-slate-200",
      };
    default:
      return {
        border: "border-[var(--border)]",
        bg: "bg-[var(--surface)]",
        iconBg: "bg-[var(--surface-2)] text-[var(--gold)]",
        accent: "text-foreground",
      };
  }
}

/** The 4 most marketable bullets shown collapsed. Mirrors what the
 *  SubscribeButton modal also surfaces, so the user sees the same
 *  pitch on the card and in the confirm screen. */
function pickTopBullets(p: CmsPlan): string[] {
  const out: string[] = [];
  out.push(
    p.listingsPerMonth === -1
      ? "Mises en ligne illimitées"
      : `${p.listingsPerMonth} mises en ligne / mois`,
  );
  out.push(`Durée d'enchère jusqu'à ${p.maxListingDurationDays} jours`);
  if (p.hasTrustedSellerBadge) out.push("Badge « vendeur de confiance »");
  if (p.searchPriorityPct > 0) {
    out.push(`Priorité de recherche +${p.searchPriorityPct}%`);
  } else if (p.hasHomepagePlacement) {
    out.push("Apparition permanente en page d'accueil");
  } else {
    out.push(`${p.maxPhotos} photos · vidéo ${p.maxVideoSeconds}s max`);
  }
  return out;
}

function pickRemainingBullets(
  p: CmsPlan,
  locale: string,
  alreadyShown: string[],
): string[] {
  const all: string[] = [];
  if (p.maxConcurrentActiveListings !== -1) {
    all.push(`${p.maxConcurrentActiveListings} annonces actives simultanées`);
  }
  all.push(`${p.maxPhotos} photos · vidéo ${p.maxVideoSeconds}s max`);
  if (p.searchPriorityPct > 0) {
    all.push(`Priorité de recherche +${p.searchPriorityPct}%`);
  }
  if (p.featuredListingDiscountPct > 0) {
    all.push(`−${p.featuredListingDiscountPct}% sur les frais Featured / VIP`);
  }
  all.push(
    `Boutique ${
      p.showroomLevel === "branded"
        ? "brandée"
        : p.showroomLevel === "custom"
          ? "personnalisée"
          : p.showroomLevel === "none"
            ? "—"
            : "standard"
    }`,
  );
  all.push(
    `Analytiques ${
      p.analyticsLevel === "advanced_export"
        ? "avancées + export"
        : p.analyticsLevel === "advanced"
          ? "avancées"
          : "basiques"
    }`,
  );
  if (p.hasTrustedSellerBadge) all.push("Badge « vendeur de confiance »");
  if (p.hasHomepagePlacement) {
    all.push("Apparition permanente en page d'accueil");
  }
  if (p.autoRenewListings) all.push("Renouvellement automatique des annonces");
  if (p.directPhoneVisible) all.push("Téléphone visible publiquement");
  if (p.bulkImportEnabled) all.push("Import en masse (CSV/Excel)");
  if (p.hasCustomReports) all.push("Rapports mensuels personnalisés");
  all.push(
    `Support ${
      p.supportLevel === "dedicated"
        ? "compte dédié"
        : p.supportLevel === "chat"
          ? "email + chat"
          : "email"
    }`,
  );
  const extras =
    locale === "ar" && p.featuresAr.length > 0
      ? p.featuresAr
      : p.features ?? [];
  extras.forEach((f) => all.push(f));
  // Dedupe + filter out what's already shown on the collapsed view.
  const shownSet = new Set(alreadyShown);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of all) {
    if (shownSet.has(b) || seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}
