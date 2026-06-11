import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, Target, Heart, Award, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "À propos — Mazed Auto",
  description:
    "Mazed Auto est une plateforme tunisienne d'enchères automobiles : vendre et acheter des véhicules en toute confiance, avec transparence et sécurité.",
};

// Pure static content — prerender at build and serve from the edge CDN.
export const dynamic = "force-static";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 py-6 lg:max-w-[var(--max-w-content)] lg:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        <ChevronLeft className="size-4" /> Accueil
      </Link>

      {/* Editorial header */}
      <header className="mt-6 space-y-3 text-center">
        <span className="batta-eyebrow block">Mazed Auto</span>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-[34px]">
          À <span className="gradient-gold-text">propos</span>
        </h1>
        <p className="mx-auto max-w-xl text-[13.5px] leading-relaxed text-muted lg:text-[14.5px]">
          Mazed Auto est une plateforme tunisienne d&apos;enchères automobiles,
          créée pour transformer la vente et l&apos;achat de véhicules en
          Tunisie en une expérience sûre et transparente.
        </p>
      </header>

      {/* Vision / mission / values */}
      <section className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ValueCard
          icon={<Target className="size-5" />}
          title="Notre vision"
          text="Devenir la référence des enchères automobiles en Tunisie et en Afrique du Nord."
        />
        <ValueCard
          icon={<Heart className="size-5" />}
          title="Notre mission"
          text="Bâtir la confiance entre vendeurs et acheteurs grâce à la vérification des annonces et des identités."
        />
        <ValueCard
          icon={<Award className="size-5" />}
          title="Nos valeurs"
          text="Transparence, sécurité, simplicité."
        />
      </section>

      {/* Story */}
      <section className="mt-10 rounded-2xl bg-surface p-5 ring-1 ring-border lg:p-7">
        <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">
          Notre histoire
        </h2>
        <div className="mt-3 space-y-4 text-[13.5px] leading-relaxed text-foreground/80">
          <p>
            L&apos;idée est née d&apos;un constat simple : le marché tunisien
            des voitures d&apos;occasion souffrait de comptes fictifs, de
            photos volées et d&apos;informations trompeuses. Nous voulions une
            solution qui place la confiance au cœur de tout.
          </p>
          <p>
            C&apos;est ainsi qu&apos;est née Mazed Auto — une plateforme qui
            combine la vérification d&apos;identité, le contrôle des documents
            du véhicule et une revue de chaque annonce avant publication. Nous
            sommes convaincus que chaque vendeur mérite une chance équitable,
            et chaque acheteur des informations sincères.
          </p>
          <p>
            Aujourd&apos;hui, notre équipe travaille depuis la Tunisie pour
            offrir des enchères équitables : caution remboursable, offres en
            temps réel et protection anti-sniping pour que la meilleure offre
            gagne, tout simplement.
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <div className="mt-10 text-center">
        <Link
          href="/properties"
          className="batta-gold-fill inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-6 text-[13px] font-extrabold shadow-[var(--shadow-gold)] ring-1 ring-black/10 transition active:scale-[0.99] lg:text-sm"
        >
          Parcourir les enchères
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function ValueCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-5 text-center ring-1 ring-border transition hover:ring-gold-soft/60">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gold-faint text-gold ring-1 ring-gold/25">
        {icon}
      </div>
      <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}
