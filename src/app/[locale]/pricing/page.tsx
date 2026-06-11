import type { Metadata } from "next";
import { Check, Sparkles, ArrowRight, X as XIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "Tarifs Pro — Mazed Auto",
  description:
    "Comptes professionnels Mazed Auto : choisissez le plan Silver, Gold ou Diamond pour vendre plus de voitures aux enchères.",
};

// Pure static content — prerender at build and serve from the edge CDN.
export const dynamic = "force-static";

/* ------------------------------------------------------------------ */
/* Static plans — v2 has no subscriptions backend yet, the cards are  */
/* purely informational and every CTA routes to /contact.             */
/* TODO(owner): real prices + quotas                                  */
/* ------------------------------------------------------------------ */

type PlanTone = "silver" | "gold" | "diamond";

type Plan = {
  slug: string;
  name: string;
  tagline: string;
  /** Placeholder monthly price in TND. */
  monthlyPrice: number;
  tone: PlanTone;
  /** -1 = illimité */
  listingsPerMonth: number;
  maxPhotos: number;
  /** 0 = aucune priorité */
  searchPriorityPct: number;
  /** 0 = aucune remise */
  featuredDiscountPct: number;
  trustedSellerBadge: boolean;
  homepagePlacement: boolean;
  support: "email" | "chat" | "dedicated";
};

const PLANS: Plan[] = [
  {
    slug: "silver",
    name: "Silver",
    tagline: "Pour démarrer votre activité de vente en ligne.",
    monthlyPrice: 99,
    tone: "silver",
    listingsPerMonth: 10,
    maxPhotos: 10,
    searchPriorityPct: 0,
    featuredDiscountPct: 0,
    trustedSellerBadge: false,
    homepagePlacement: false,
    support: "email",
  },
  {
    slug: "gold",
    name: "Gold",
    tagline: "Le meilleur équilibre pour les vendeurs réguliers.",
    monthlyPrice: 199,
    tone: "gold",
    listingsPerMonth: 30,
    maxPhotos: 15,
    searchPriorityPct: 15,
    featuredDiscountPct: 10,
    trustedSellerBadge: true,
    homepagePlacement: false,
    support: "chat",
  },
  {
    slug: "diamond",
    name: "Diamond",
    tagline: "Pour les concessionnaires à fort volume.",
    monthlyPrice: 399,
    tone: "diamond",
    listingsPerMonth: -1,
    maxPhotos: 20,
    searchPriorityPct: 30,
    featuredDiscountPct: 25,
    trustedSellerBadge: true,
    homepagePlacement: true,
    support: "dedicated",
  },
];

const SUPPORT_LABEL: Record<Plan["support"], string> = {
  email: "Email",
  chat: "Email + chat",
  dedicated: "Compte dédié",
};

/* ------------------------------------------------------------------ */

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-4 pb-10 pt-6 lg:max-w-[var(--max-w-wide)] lg:px-8 lg:pb-16 lg:pt-12">
      {/* Centered editorial header */}
      <header className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 text-[10px] lg:text-[11px] uppercase tracking-[0.22em] font-bold text-gold">
          <Sparkles className="size-3 lg:size-3.5" />
          Comptes professionnels
        </div>
        <h1 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight">
          Choisissez votre plan
        </h1>
        <p className="mx-auto max-w-2xl text-[13px] lg:text-base leading-relaxed text-muted">
          Vendez plus de voitures avec plus d&apos;annonces, un placement
          prioritaire dans les résultats et un badge de confiance. Mensuel,
          sans engagement.
        </p>
      </header>

      {/* Plan cards — stacked on mobile, 3-up from md */}
      <div className="mt-8 grid gap-4 md:grid-cols-3 lg:mt-12 lg:gap-6">
        {PLANS.map((plan) => (
          <PlanCard key={plan.slug} plan={plan} />
        ))}
      </div>

      {/* Detailed comparison — desktop only */}
      <div className="hidden md:block">
        <ComparisonTable />
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-[11px] lg:text-xs leading-relaxed text-muted lg:mt-10">
        Offre de lancement — les abonnements en ligne arrivent bientôt.
        Contactez-nous pour activer un compte professionnel.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TONE_BORDER: Record<PlanTone, string> = {
  silver: "border-slate-400/40 ring-slate-400/20",
  gold: "border-[var(--gold)] ring-[var(--gold)]/20",
  diamond: "border-cyan-500/40 ring-cyan-500/20",
};

const TONE_ACCENT: Record<PlanTone, string> = {
  silver: "text-slate-300",
  gold: "text-gold",
  diamond: "text-cyan-300",
};

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl bg-surface border-2 ring-1 p-5 lg:p-6 ${TONE_BORDER[plan.tone]}`}
    >
      {plan.tone === "gold" && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="batta-gold-fill whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] shadow-[var(--shadow-gold)]">
            Recommandé
          </span>
        </div>
      )}

      <div
        className={`text-[11px] lg:text-xs uppercase tracking-[0.22em] font-bold ${TONE_ACCENT[plan.tone]}`}
      >
        {plan.name}
      </div>
      <div className="mt-1 text-[13px] lg:text-sm leading-snug text-muted">
        {plan.tagline}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-1 lg:mt-5">
        <span className="batta-tabular text-3xl lg:text-4xl font-black leading-none">
          {plan.monthlyPrice} TND
        </span>
        <span className="text-[11px] lg:text-xs text-muted">/ mois</span>
      </div>

      <ul className="mt-4 flex-1 space-y-1.5 text-[13px] lg:mt-5 lg:space-y-2 lg:text-sm">
        <Bullet>
          {plan.listingsPerMonth === -1
            ? "Mises en ligne illimitées"
            : `${plan.listingsPerMonth} mises en ligne / mois`}
        </Bullet>
        <Bullet>{plan.maxPhotos} photos par annonce</Bullet>
        {plan.searchPriorityPct > 0 && (
          <Bullet>Priorité de recherche +{plan.searchPriorityPct}%</Bullet>
        )}
        {plan.featuredDiscountPct > 0 && (
          <Bullet>
            −{plan.featuredDiscountPct}% sur les mises en avant
          </Bullet>
        )}
        {plan.trustedSellerBadge && (
          <Bullet>Badge « vendeur de confiance »</Bullet>
        )}
        {plan.homepagePlacement && (
          <Bullet>Apparition permanente en page d&apos;accueil</Bullet>
        )}
        <Bullet>Support {SUPPORT_LABEL[plan.support].toLowerCase()}</Bullet>
      </ul>

      <div className="mt-4 border-t border-border pt-4 lg:mt-5 lg:pt-5">
        {plan.tone === "gold" ? (
          <Link
            href="/contact"
            className="batta-gold-fill inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] lg:text-sm font-extrabold shadow-[var(--shadow-gold)] ring-1 ring-black/10 transition active:scale-[0.99]"
          >
            Nous contacter
            <ArrowRight className="size-4" />
          </Link>
        ) : (
          <Link
            href="/contact"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[13px] lg:text-sm font-semibold ring-1 ring-border transition hover:ring-gold-soft/60"
          >
            Nous contacter
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={2.5} />
      <span>{children}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function ComparisonTable() {
  return (
    <section className="pt-8 lg:pt-12">
      <h2 className="mb-3 text-lg lg:text-2xl font-extrabold tracking-tight">
        Comparatif détaillé
      </h2>
      <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-border [scrollbar-width:thin]">
        <table className="w-full min-w-[560px] text-[13px] lg:text-sm">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.18em] font-bold text-muted">
            <tr>
              <th className="sticky start-0 z-10 bg-surface-2 p-3 text-start"></th>
              {PLANS.map((p) => (
                <th key={p.slug} className="whitespace-nowrap p-3 text-start">
                  <span className={TONE_ACCENT[p.tone]}>{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <Row
              label="Prix / mois"
              values={PLANS.map((p) => `${p.monthlyPrice} TND`)}
            />
            <Row
              label="Mises en ligne / mois"
              values={PLANS.map((p) =>
                p.listingsPerMonth === -1 ? "∞" : String(p.listingsPerMonth),
              )}
            />
            <Row
              label="Photos max"
              values={PLANS.map((p) => String(p.maxPhotos))}
            />
            <Row
              label="Priorité de recherche"
              values={PLANS.map((p) =>
                p.searchPriorityPct > 0 ? `+${p.searchPriorityPct}%` : "—",
              )}
            />
            <Row
              label="Remise mises en avant"
              values={PLANS.map((p) =>
                p.featuredDiscountPct > 0 ? `−${p.featuredDiscountPct}%` : "—",
              )}
            />
            <BoolRow
              label="Badge confiance"
              values={PLANS.map((p) => p.trustedSellerBadge)}
            />
            <BoolRow
              label="Page d'accueil permanente"
              values={PLANS.map((p) => p.homepagePlacement)}
            />
            <Row
              label="Support"
              values={PLANS.map((p) => SUPPORT_LABEL[p.support])}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="sticky start-0 z-10 min-w-[140px] bg-surface p-3 font-semibold text-muted">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="batta-tabular whitespace-nowrap p-3">
          {v}
        </td>
      ))}
    </tr>
  );
}

function BoolRow({ label, values }: { label: string; values: boolean[] }) {
  return (
    <tr>
      <td className="sticky start-0 z-10 min-w-[140px] bg-surface p-3 font-semibold text-muted">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="p-3">
          {v ? (
            <Check className="size-4 text-gold" />
          ) : (
            <XIcon className="size-4 text-subtle" />
          )}
        </td>
      ))}
    </tr>
  );
}
