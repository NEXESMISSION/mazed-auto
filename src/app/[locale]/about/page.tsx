import Link from "next/link";
import { ArrowRight, Target, Heart, Award } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";

export default function AboutPage() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-16 space-y-10">
        <header className="text-center space-y-3">
          <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
            À <span className="gradient-gold-text">propos</span>
          </h1>
          <p className="text-[var(--foreground-muted)] max-w-xl mx-auto leading-relaxed">
            Mazed Auto est une plateforme tunisienne intelligente d'enchères automobiles, fondée pour
            transformer la vente et l'achat de véhicules en Tunisie en une expérience sûre et transparente.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card
            icon={<Target className="h-5 w-5" />}
            title="Notre vision"
            text="La première plateforme d'enchères en Afrique du Nord"
          />
          <Card
            icon={<Heart className="h-5 w-5" />}
            title="Notre mission"
            text="Bâtir la confiance entre vendeurs et acheteurs grâce à une vérification intelligente"
          />
          <Card
            icon={<Award className="h-5 w-5" />}
            title="Nos valeurs"
            text="Transparence, sécurité, simplicité"
          />
        </section>

        <section className="space-y-4 text-[var(--foreground-muted)] leading-relaxed">
          <h2 className="text-2xl font-bold text-foreground">Notre histoire</h2>
          <p>
            L'idée est née d'un constat simple : le marché tunisien des voitures d'occasion souffrait de
            comptes fictifs, de photos volées et d'informations trompeuses. Nous voulions une solution qui
            place la confiance au cœur de tout.
          </p>
          <p>
            C'est ainsi qu'est née Mazed Auto — une plateforme qui combine la technologie (intelligence
            artificielle, vérification automatique) et une transparence totale (Trust Score, badges multiples).
            Nous sommes convaincus que chaque vendeur mérite une chance équitable, et chaque acheteur des
            informations sincères.
          </p>
        </section>

        <div className="text-center">
          <Link href="/auctions">
            <Button size="lg">
              Parcourir les enchères
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Card({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5 text-center hover:border-[var(--gold)] transition-colors">
      <div className="mx-auto h-12 w-12 rounded-full bg-[var(--gold-faint)] flex items-center justify-center text-[var(--gold)] mb-3">
        {icon}
      </div>
      <h3 className="font-bold mb-1">{title}</h3>
      <p className="text-sm text-[var(--foreground-muted)]">{text}</p>
    </div>
  );
}
