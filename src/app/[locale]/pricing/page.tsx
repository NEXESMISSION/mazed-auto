import { getLocale } from "next-intl/server";
import { Check, Sparkles, ArrowRight, X as XIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCmsPlans, type CmsPlan } from "@/lib/cms";
import { getActiveSubscription } from "@/lib/subscription";
import { formatDateTime, formatPrice } from "@/lib/format";
import { SubscribeButton } from "./SubscribeButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PricingPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const [plans, { data: userResp }] = await Promise.all([
    listCmsPlans(supabase),
    supabase.auth.getUser(),
  ]);
  const user = userResp?.user ?? null;
  const active = user ? await getActiveSubscription(user.id) : null;

  return (
    <AppShell>
      <div className="py-5 lg:py-12 max-w-6xl mx-auto space-y-6 lg:space-y-10">
        <header className="text-center space-y-2.5 lg:space-y-3 px-4 lg:px-8">
          <div className="inline-flex items-center gap-1.5 text-[10px] lg:text-[11px] uppercase tracking-[0.2em] lg:tracking-[0.22em] font-bold text-[var(--gold)]">
            <Sparkles className="h-3.5 w-3.5" />
            Comptes professionnels
          </div>
          <h1 className="text-[28px] leading-[1.1] lg:text-5xl font-extrabold lg:font-black tracking-tight">
            Choisissez votre plan
          </h1>
          <p className="text-[13px] lg:text-base text-[var(--foreground-muted)] max-w-2xl mx-auto leading-relaxed">
            Vendez plus de voitures avec une boutique dédiée, des analytiques et
            un placement prioritaire dans les résultats. Mensuel sans
            engagement.
          </p>
          {active && (
            <div className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-full bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 px-3 py-1.5 text-[11px] lg:text-xs max-w-[calc(100vw-2rem)]">
              <span>Plan actuel :</span>
              <span className="font-bold text-[var(--gold-bright)]">
                {active.planName}
              </span>
              <span className="text-[var(--foreground-subtle)]">·</span>
              <span>
                expire le{" "}
                {formatDateTime(active.currentPeriodEnd, locale, {
                  dateStyle: "medium",
                })}
              </span>
            </div>
          )}
        </header>

        {plans.length === 0 ? (
          <div className="mx-4 lg:mx-0 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
            Aucun plan publié.
          </div>
        ) : (
          <>
            {/* MOBILE — horizontal snap-scroll carousel.
                Each card takes ~88% of the viewport so the next one
                peeks in from the edge as a strong "swipe me" affordance.
                snap-mandatory keeps cards locked once a swipe lands. */}
            <div className="md:hidden">
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 pb-3 -mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {plans.map((p) => (
                  <div
                    key={p.slug}
                    className="snap-center shrink-0 w-[88%] max-w-sm first:ms-0 last:me-0"
                  >
                    <PlanCard
                      plan={p}
                      locale={locale}
                      signedIn={Boolean(user)}
                      isCurrent={active?.planSlug === p.slug}
                      hasOtherPlan={Boolean(active && active.planSlug !== p.slug)}
                    />
                  </div>
                ))}
              </div>
              {plans.length > 1 && (
                <div className="text-center mt-3 text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-subtle)]">
                  ← Glissez pour comparer →
                </div>
              )}
            </div>

            {/* DESKTOP — 3-up grid */}
            <div className="hidden md:grid md:grid-cols-3 gap-4 lg:gap-6 px-4 lg:px-8">
              {plans.map((p) => (
                <PlanCard
                  key={p.slug}
                  plan={p}
                  locale={locale}
                  signedIn={Boolean(user)}
                  isCurrent={active?.planSlug === p.slug}
                  hasOtherPlan={Boolean(active && active.planSlug !== p.slug)}
                />
              ))}
            </div>
          </>
        )}

        <div className="px-4 lg:px-8">
          <ComparisonTable plans={plans} />
        </div>

        <section className="text-[11px] lg:text-xs text-[var(--foreground-muted)] text-center max-w-3xl mx-auto pt-2 lg:pt-4 space-y-1 px-4 lg:px-8">
          <p>
            ⚠ Paiement en mode <span className="font-semibold">simulé</span>{" "}
            (tests). Aucun montant n&apos;est réellement débité — la
            passerelle bancaire sera branchée prochainement.
          </p>
          <p className="text-[var(--foreground-subtle)]">
            Aucun engagement, annulation à tout moment depuis votre profil.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function PlanCard({
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
  const name = locale === "ar" ? plan.nameAr ?? plan.nameFr : plan.nameFr;
  const tagline =
    locale === "ar"
      ? plan.taglineAr ?? plan.taglineFr
      : plan.taglineFr ?? plan.taglineAr;
  const tone =
    plan.badgeTone === "diamond"
      ? "border-cyan-500/40 ring-cyan-500/20"
      : plan.badgeTone === "gold"
        ? "border-[var(--gold)] ring-[var(--gold)]/20"
        : plan.badgeTone === "silver"
          ? "border-slate-400/40 ring-slate-400/20"
          : "border-[var(--border)]";
  const accent =
    plan.badgeTone === "diamond"
      ? "text-cyan-300"
      : plan.badgeTone === "gold"
        ? "text-[var(--gold)]"
        : plan.badgeTone === "silver"
          ? "text-slate-300"
          : "text-foreground";

  return (
    <div
      className={`relative h-full rounded-2xl bg-[var(--surface)] border-2 ${tone} ring-1 p-5 lg:p-6 flex flex-col`}
    >
      {plan.badgeTone === "gold" && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="bg-[var(--gold)] text-black text-[10px] uppercase tracking-[0.22em] font-extrabold px-3 py-1 rounded-full whitespace-nowrap">
            Recommandé
          </span>
        </div>
      )}
      <div
        className={`text-[11px] lg:text-xs uppercase tracking-[0.22em] font-bold ${accent}`}
      >
        {name}
      </div>
      {tagline && (
        <div className="text-[13px] lg:text-sm text-[var(--foreground-muted)] mt-1 leading-snug">
          {tagline}
        </div>
      )}
      <div className="mt-4 lg:mt-5 flex items-baseline gap-1 flex-wrap">
        <span className="text-3xl lg:text-4xl font-black tabular-nums leading-none">
          {formatPrice(plan.monthlyPrice)}
        </span>
        <span className="text-[11px] lg:text-xs text-[var(--foreground-muted)]">
          / mois
        </span>
      </div>
      <ul className="mt-4 lg:mt-5 space-y-1.5 lg:space-y-2 text-[13px] lg:text-sm flex-1">
        <Bullet>
          {plan.listingsPerMonth === -1
            ? "Mises en ligne illimitées"
            : `${plan.listingsPerMonth} mises en ligne / mois`}
        </Bullet>
        {plan.maxConcurrentActiveListings !== -1 && (
          <Bullet>
            {plan.maxConcurrentActiveListings} annonces actives simultanées
          </Bullet>
        )}
        <Bullet>
          Durée d&apos;enchère jusqu&apos;à {plan.maxListingDurationDays} jours
        </Bullet>
        <Bullet>
          {plan.maxPhotos} photos · vidéo {plan.maxVideoSeconds}s max
        </Bullet>
        {plan.searchPriorityPct > 0 && (
          <Bullet>Priorité de recherche +{plan.searchPriorityPct}%</Bullet>
        )}
        {plan.featuredListingDiscountPct > 0 && (
          <Bullet>
            −{plan.featuredListingDiscountPct}% sur les frais Featured / VIP
          </Bullet>
        )}
        <Bullet>
          Boutique{" "}
          {plan.showroomLevel === "branded"
            ? "brandée"
            : plan.showroomLevel === "custom"
              ? "personnalisée"
              : plan.showroomLevel === "none"
                ? "—"
                : "standard"}
        </Bullet>
        <Bullet>
          Analytiques{" "}
          {plan.analyticsLevel === "advanced_export"
            ? "avancées + export"
            : plan.analyticsLevel === "advanced"
              ? "avancées"
              : "basiques"}
        </Bullet>
        {plan.hasTrustedSellerBadge && (
          <Bullet>Badge « vendeur de confiance »</Bullet>
        )}
        {plan.hasHomepagePlacement && (
          <Bullet>Apparition permanente en page d&apos;accueil</Bullet>
        )}
        {plan.autoRenewListings && (
          <Bullet>Renouvellement automatique des annonces</Bullet>
        )}
        {plan.directPhoneVisible && <Bullet>Téléphone visible publiquement</Bullet>}
        {plan.bulkImportEnabled && <Bullet>Import en masse (CSV/Excel)</Bullet>}
        {plan.hasCustomReports && <Bullet>Rapports mensuels personnalisés</Bullet>}
        <Bullet>
          Support{" "}
          {plan.supportLevel === "dedicated"
            ? "compte dédié"
            : plan.supportLevel === "chat"
              ? "email + chat"
              : "email"}
        </Bullet>
        {(locale === "ar" && plan.featuresAr.length > 0
          ? plan.featuresAr
          : plan.features
        ).map((f, i) => (
          <Bullet key={i}>{f}</Bullet>
        ))}
      </ul>
      <div className="pt-4 lg:pt-5 mt-4 lg:mt-5 border-t border-[var(--border)]">
        {!signedIn ? (
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 w-full h-11 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors text-[13px] lg:text-sm font-semibold"
          >
            Connectez-vous pour souscrire
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : isCurrent ? (
          <div className="inline-flex items-center justify-center gap-1.5 w-full h-11 rounded-[var(--radius)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 text-[13px] lg:text-sm font-bold text-[var(--gold-bright)]">
            <Check className="h-4 w-4" />
            Plan actuel
          </div>
        ) : (
          <SubscribeButton
            planSlug={plan.slug}
            planName={name}
            monthlyPrice={plan.monthlyPrice}
            bullets={planSummaryBullets(plan)}
            mode={hasOtherPlan ? "switch" : "subscribe"}
          />
        )}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 items-start">
      <Check className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function ComparisonTable({ plans }: { plans: CmsPlan[] }) {
  if (plans.length === 0) return null;
  return (
    <section className="pt-2 lg:pt-6">
      <h2 className="text-lg lg:text-2xl font-extrabold mb-2 lg:mb-3">
        Comparatif détaillé
      </h2>
      <p className="md:hidden text-[11px] text-[var(--foreground-subtle)] mb-2">
        ← Faites glisser pour voir tous les plans →
      </p>
      <div className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] [scrollbar-width:thin]">
        <table className="w-full text-[13px] lg:text-sm min-w-[560px]">
          <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-[0.16em] lg:tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            <tr>
              <th className="text-start p-2.5 lg:p-3 sticky start-0 bg-[var(--surface-2)] z-10"></th>
              {plans.map((p) => (
                <th key={p.slug} className="text-start p-2.5 lg:p-3 whitespace-nowrap">
                  {p.nameFr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <Row label="Prix / mois" values={plans.map((p) => `${p.monthlyPrice} DT`)} />
            <Row
              label="Mises en ligne / mois"
              values={plans.map((p) =>
                p.listingsPerMonth === -1 ? "∞" : String(p.listingsPerMonth),
              )}
            />
            <Row
              label="Actives simultanées"
              values={plans.map((p) =>
                p.maxConcurrentActiveListings === -1
                  ? "∞"
                  : String(p.maxConcurrentActiveListings),
              )}
            />
            <Row
              label="Durée max enchère"
              values={plans.map((p) => `${p.maxListingDurationDays} j`)}
            />
            <Row
              label="Photos max"
              values={plans.map((p) => String(p.maxPhotos))}
            />
            <Row
              label="Vidéo max"
              values={plans.map((p) => `${p.maxVideoSeconds}s`)}
            />
            <Row
              label="Priorité de recherche"
              values={plans.map((p) =>
                p.searchPriorityPct > 0 ? `+${p.searchPriorityPct}%` : "—",
              )}
            />
            <Row
              label="Remise Featured / VIP"
              values={plans.map((p) =>
                p.featuredListingDiscountPct > 0
                  ? `−${p.featuredListingDiscountPct}%`
                  : "—",
              )}
            />
            <Row label="Boutique" values={plans.map((p) => showroomLabel(p))} />
            <Row
              label="Analytiques"
              values={plans.map((p) => analyticsLabel(p))}
            />
            <BoolRow
              label="Badge confiance"
              values={plans.map((p) => p.hasTrustedSellerBadge)}
            />
            <BoolRow
              label="Page d'accueil permanente"
              values={plans.map((p) => p.hasHomepagePlacement)}
            />
            <BoolRow
              label="Renouvellement auto"
              values={plans.map((p) => p.autoRenewListings)}
            />
            <BoolRow
              label="Téléphone visible"
              values={plans.map((p) => p.directPhoneVisible)}
            />
            <BoolRow
              label="Import CSV/Excel"
              values={plans.map((p) => p.bulkImportEnabled)}
            />
            <BoolRow
              label="Rapports personnalisés"
              values={plans.map((p) => p.hasCustomReports)}
            />
            <Row label="Support" values={plans.map((p) => supportLabel(p))} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="p-2.5 lg:p-3 text-[var(--foreground-muted)] font-semibold sticky start-0 bg-[var(--surface)] z-10 min-w-[140px]">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="p-2.5 lg:p-3 tabular-nums whitespace-nowrap">
          {v}
        </td>
      ))}
    </tr>
  );
}

function BoolRow({ label, values }: { label: string; values: boolean[] }) {
  return (
    <tr>
      <td className="p-2.5 lg:p-3 text-[var(--foreground-muted)] font-semibold sticky start-0 bg-[var(--surface)] z-10 min-w-[140px]">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="p-2.5 lg:p-3">
          {v ? (
            <Check className="h-4 w-4 text-[var(--gold)]" />
          ) : (
            <XIcon className="h-4 w-4 text-[var(--foreground-subtle)]" />
          )}
        </td>
      ))}
    </tr>
  );
}

/** Pick the most marketable 4–6 lines for the confirm-modal summary. */
function planSummaryBullets(p: CmsPlan): string[] {
  const out: string[] = [];
  out.push(
    p.listingsPerMonth === -1
      ? "Mises en ligne illimitées"
      : `${p.listingsPerMonth} mises en ligne / mois`,
  );
  out.push(`Durée d'enchère jusqu'à ${p.maxListingDurationDays} jours`);
  if (p.searchPriorityPct > 0)
    out.push(`Priorité de recherche +${p.searchPriorityPct}%`);
  if (p.featuredListingDiscountPct > 0)
    out.push(`−${p.featuredListingDiscountPct}% sur Featured / VIP`);
  if (p.hasTrustedSellerBadge) out.push("Badge « vendeur de confiance »");
  if (p.hasHomepagePlacement)
    out.push("Apparition permanente en page d'accueil");
  return out;
}

function showroomLabel(p: CmsPlan) {
  return p.showroomLevel === "branded"
    ? "Brandée"
    : p.showroomLevel === "custom"
      ? "Personnalisée"
      : p.showroomLevel === "none"
        ? "—"
        : "Standard";
}

function analyticsLabel(p: CmsPlan) {
  return p.analyticsLevel === "advanced_export"
    ? "Avancées + export"
    : p.analyticsLevel === "advanced"
      ? "Avancées"
      : "Basiques";
}

function supportLabel(p: CmsPlan) {
  return p.supportLevel === "dedicated"
    ? "Compte dédié"
    : p.supportLevel === "chat"
      ? "Email + chat"
      : "Email";
}
