import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  ChevronLeft,
  Search,
  Gavel,
  Trophy,
  ShieldCheck,
  FileCheck,
  Camera,
  Wallet,
  Award,
  Activity,
  Timer,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Comment ça marche — Mazed Auto",
  description:
    "Le parcours acheteur et vendeur sur Mazed Auto : caution remboursable, enchères en temps réel, vérification d'identité et des documents du véhicule.",
};

// Pure static content — prerender at build and serve from the edge CDN.
export const dynamic = "force-static";

export default function HowItWorksPage() {
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
        <span className="batta-eyebrow block">Le guide</span>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-[34px]">
          Comment fonctionne{" "}
          <span className="gradient-gold-text">Mazed Auto</span> ?
        </h1>
        <p className="mx-auto max-w-xl text-[13.5px] leading-relaxed text-muted lg:text-[14.5px]">
          Une plateforme transparente, sécurisée et rapide. Découvrez votre
          parcours à chaque étape.
        </p>
      </header>

      {/* Buyer journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">Parcours acheteur</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          De la recherche à la victoire en 4 étapes
        </h2>
        <div className="space-y-3">
          <FlowStep
            num={1}
            icon={<Search className="size-5" />}
            title="Rechercher et filtrer"
            text="Parcourez les voitures vérifiées et affinez par carburant, année, kilométrage ou état pour trouver celle qui vous convient."
          />
          <FlowStep
            num={2}
            icon={<Wallet className="size-5" />}
            title="Payer la caution"
            text="Une caution remboursable, calculée sur la mise à prix, débloque la participation. Elle vous est intégralement restituée si vous ne remportez pas l'enchère."
          />
          <FlowStep
            num={3}
            icon={<Gavel className="size-5" />}
            title="Enchérir en confiance"
            text="Offres en temps réel avec incrément minimum clair. Auto-enchère et anti-sniping : toute offre dans les dernières minutes prolonge l'enchère."
          />
          <FlowStep
            num={4}
            icon={<Trophy className="size-5" />}
            title="Payer et récupérer"
            text="Si vous gagnez, réglez le solde dans le délai indiqué puis convenez de la remise du véhicule avec le vendeur."
          />
        </div>
      </section>

      {/* Seller journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">Parcours vendeur</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          Publiez votre enchère en 5 étapes
        </h2>
        <div className="space-y-3">
          <FlowStep
            num={1}
            icon={<ShieldCheck className="size-5" />}
            title="Vérifiez votre identité"
            text="KYC en quelques minutes : pièce d'identité et selfie. Une seule fois, pour sécuriser toute la communauté."
          />
          <FlowStep
            num={2}
            icon={<Camera className="size-5" />}
            title="Photographiez votre voiture"
            text="Ajoutez jusqu'à 10 photos nettes et renseignez les caractéristiques : marque, modèle, année, kilométrage, état."
          />
          <FlowStep
            num={3}
            icon={<FileCheck className="size-5" />}
            title="Justifiez la propriété"
            text="Téléversez la carte grise et les documents demandés. Notre équipe vérifie chaque annonce avant publication."
          />
          <FlowStep
            num={4}
            icon={<Gavel className="size-5" />}
            title="Définissez vos prix"
            text="Mise à prix, prix de réserve optionnel et achat immédiat si vous le souhaitez. Vous gardez la main."
          />
          <FlowStep
            num={5}
            icon={<Trophy className="size-5" />}
            title="Recevez les offres"
            text="Votre enchère est publiée et les offres arrivent en direct jusqu'à la clôture. Le meilleur enchérisseur l'emporte."
          />
        </div>
      </section>

      {/* Trust block */}
      <section className="mt-12 rounded-2xl bg-surface p-6 ring-1 ring-gold-soft/30 lg:p-8">
        <div className="mb-6 text-center">
          <Award className="mx-auto mb-3 size-10 text-gold" />
          <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">
            Un <span className="gradient-gold-text">système de confiance</span>{" "}
            à chaque étape
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            Chaque annonce et chaque participant passent par des contrôles
            avant que la première offre ne soit placée.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <TrustItem
            icon={<ShieldCheck className="size-4" />}
            text="KYC d'identité"
          />
          <TrustItem
            icon={<FileCheck className="size-4" />}
            text="Documents du véhicule"
          />
          <TrustItem
            icon={<Search className="size-4" />}
            text="Revue avant publication"
          />
          <TrustItem
            icon={<Wallet className="size-4" />}
            text="Caution remboursable"
          />
          <TrustItem
            icon={<Timer className="size-4" />}
            text="Protection anti-sniping"
          />
          <TrustItem
            icon={<Activity className="size-4" />}
            text="Offres en temps réel"
          />
        </div>
      </section>

      {/* Closing CTA */}
      <div className="mt-12 text-center">
        <Link
          href="/signup"
          className="batta-gold-fill inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-6 text-[13px] font-extrabold shadow-[var(--shadow-gold)] ring-1 ring-black/10 transition active:scale-[0.99] lg:text-sm"
        >
          Commencer maintenant
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function FlowStep({
  num,
  icon,
  title,
  text,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-surface p-4 ring-1 ring-border transition hover:ring-gold-soft/60">
      <div className="batta-tabular flex size-12 shrink-0 items-center justify-center rounded-full bg-gold-faint text-lg font-extrabold text-gold ring-1 ring-gold/25">
        {num}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-gold">{icon}</span>
          <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

function TrustItem({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
      <span className="shrink-0 text-gold">{icon}</span>
      <span className="text-[13px] font-semibold text-foreground">{text}</span>
    </div>
  );
}
