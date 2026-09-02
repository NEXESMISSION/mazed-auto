import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  ChevronLeft,
  Search,
  Tag,
  Phone,
  Handshake,
  ShieldCheck,
  FileCheck,
  Camera,
  Wallet,
  Award,
  Timer,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Comment ça marche — Mazed Auto",
  description:
    "Le parcours acheteur et vendeur sur Mazed Auto : prix affichés, contact direct avec le vendeur, diagnostic Mazed et vérification de chaque annonce avant publication.",
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
          Des voitures et des pièces à prix affiché. Vous parlez directement au
          vendeur ; nous vérifions chaque annonce avant qu&apos;elle soit en ligne.
        </p>
      </header>

      {/* Buyer journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">Parcours acheteur</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          De la recherche à l&apos;appel, en 4 étapes
        </h2>
        <div className="space-y-3">
          <FlowStep
            num={1}
            icon={<Search className="size-5" />}
            title="Cherchez la voiture ou la pièce"
            text="Filtrez par gouvernorat, budget, marque ou état. Pour une pièce de rechange, indiquez votre marque, votre modèle et votre année : seules les pièces compatibles s'affichent."
          />
          <FlowStep
            num={2}
            icon={<Tag className="size-5" />}
            title="Le prix est affiché"
            text="Pas d'enchère et pas d'attente : le prix demandé est sur l'annonce, avec les photos, les caractéristiques et le gouvernorat du vendeur."
          />
          <FlowStep
            num={3}
            icon={<Phone className="size-5" />}
            title="Appelez le vendeur"
            text="Affichez son numéro et contactez-le directement. Mazed Auto n'intervient ni dans la négociation ni dans le paiement : vous traitez avec le vendeur."
          />
          <FlowStep
            num={4}
            icon={<Handshake className="size-5" />}
            title="Voyez le véhicule, puis concluez"
            text="Fixez un rendez-vous, examinez la voiture et convenez du prix entre vous. Quand une annonce porte le badge « Vérifié et approuvé », notre fiche de diagnostic vous dit ce que nous avons constaté."
          />
        </div>
      </section>

      {/* Seller journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">Parcours vendeur</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          Publiez votre annonce en 5 étapes
        </h2>
        <div className="space-y-3">
          <FlowStep
            num={1}
            icon={<Camera className="size-5" />}
            title="Photographiez et décrivez"
            text="Jusqu'à 12 photos nettes, puis les caractéristiques : marque, modèle, année, kilométrage, état. Pour une pièce, indiquez les véhicules sur lesquels elle se monte."
          />
          <FlowStep
            num={2}
            icon={<Phone className="size-5" />}
            title="Mettez vos coordonnées"
            text="Votre numéro figure sur l'annonce : les acheteurs vous appellent directement, et vous décidez avec qui vous traitez."
          />
          <FlowStep
            num={3}
            icon={<FileCheck className="size-5" />}
            title="Signez l'attestation"
            text="Vous confirmez que les informations sont exactes. Une fausse déclaration nous autorise à refuser ou à retirer l'annonce."
          />
          <FlowStep
            num={4}
            icon={<Wallet className="size-5" />}
            title="Réglez la publication"
            text="Un montant fixe par annonce, ou une publication décomptée de votre forfait. Les pièces de rechange sont publiées gratuitement."
          />
          <FlowStep
            num={5}
            icon={<ShieldCheck className="size-5" />}
            title="Nous vérifions, puis c&apos;est en ligne"
            text="Notre équipe contrôle l'annonce avant sa publication. Elle reste visible 30 jours, et vous pouvez la renouveler ensuite."
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
            Nous ne touchons pas à l&apos;argent de la vente. Ce que nous
            garantissons, c&apos;est que l&apos;annonce que vous lisez a été
            contrôlée avant d&apos;être publiée.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <TrustItem
            icon={<Search className="size-4" />}
            text="Revue avant publication"
          />
          <TrustItem
            icon={<Award className="size-4" />}
            text="Diagnostic Mazed"
          />
          <TrustItem
            icon={<ShieldCheck className="size-4" />}
            text="Badge vendeur vérifié"
          />
          <TrustItem
            icon={<FileCheck className="size-4" />}
            text="Attestation du vendeur"
          />
          <TrustItem
            icon={<Phone className="size-4" />}
            text="Contact direct"
          />
          <TrustItem
            icon={<Timer className="size-4" />}
            text="Annonces à durée limitée"
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
