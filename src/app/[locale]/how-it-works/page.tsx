import { Link } from "@/i18n/navigation";
import {
  Search,
  Gavel,
  Trophy,
  ShieldCheck,
  FileCheck,
  Camera,
  Video,
  Award,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";

export default function HowItWorksPage() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-16 space-y-12">
        <header className="text-center space-y-3">
          <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
            Comment fonctionne <span className="gradient-gold-text">Mazed Auto</span> ?
          </h1>
          <p className="text-[var(--foreground-muted)] max-w-xl mx-auto">
            Une plateforme transparente, sécurisée et rapide. Découvrez votre parcours à chaque étape.
          </p>
        </header>

        {/* Buyer journey */}
        <section>
          <div className="text-xs font-bold text-[var(--gold)] uppercase mb-2">
            Parcours acheteur
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            De la recherche à la victoire en 4 étapes
          </h2>
          <div className="space-y-3">
            <FlowStep
              num={1}
              icon={<Search className="h-5 w-5" />}
              title="Rechercher et filtrer"
              text="Parcourez des milliers de voitures vérifiées. Utilisez les filtres intelligents pour trouver ce qui vous convient."
            />
            <FlowStep
              num={2}
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Payer la caution"
              text="5% du prix de départ pour participer. Intégralement remboursée si vous ne gagnez pas."
            />
            <FlowStep
              num={3}
              icon={<Gavel className="h-5 w-5" />}
              title="Enchérir en confiance"
              text="Système d'enchères instantané et équitable. Auto-enchère et anti-sniping pour vous protéger."
            />
            <FlowStep
              num={4}
              icon={<Trophy className="h-5 w-5" />}
              title="Payer et récupérer"
              text="Si vous gagnez, payez le solde sous 7 jours et entrez en contact avec le vendeur."
            />
          </div>
        </section>

        {/* Seller journey */}
        <section>
          <div className="text-xs font-bold text-[var(--gold)] uppercase mb-2">
            Parcours vendeur
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            Publiez votre enchère en 5 étapes
          </h2>
          <div className="space-y-3">
            <FlowStep
              num={1}
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Vérifiez votre identité"
              text="KYC obligatoire une seule fois, valable un an."
            />
            <FlowStep
              num={2}
              icon={<Camera className="h-5 w-5" />}
              title="Photographiez votre voiture"
              text="12 photos sous des angles précis + vidéo de 60 secondes."
            />
            <FlowStep
              num={3}
              icon={<FileCheck className="h-5 w-5" />}
              title="Vérifier la propriété"
              text="Téléversez la carte grise, vérification automatique avec votre identité."
            />
            <FlowStep
              num={4}
              icon={<Gavel className="h-5 w-5" />}
              title="Définissez le prix"
              text="Prix de départ + prix de réserve + achat immédiat (optionnel)."
            />
            <FlowStep
              num={5}
              icon={<Trophy className="h-5 w-5" />}
              title="Recevez les offres"
              text="Enchère de 3 à 14 jours, avec mise à jour en direct des offres."
            />
          </div>
        </section>

        {/* Trust System */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--gold-soft)]/30 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-6 md:p-8">
          <div className="text-center mb-6">
            <Award className="h-10 w-10 text-[var(--gold)] mx-auto mb-3" />
            <h2 className="text-2xl md:text-3xl font-bold">
              Système de confiance <span className="gradient-gold-text">Trust System</span>
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 max-w-md mx-auto">
              9 modules de vérification obligatoires détectant 80% des fraudes avant publication
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <TrustItem icon={<ShieldCheck className="h-4 w-4" />} text="KYC d'identité" />
            <TrustItem icon={<FileCheck className="h-4 w-4" />} text="Propriété du véhicule" />
            <TrustItem icon={<Camera className="h-4 w-4" />} text="12 photos obligatoires" />
            <TrustItem icon={<Search className="h-4 w-4" />} text="Recherche inversée IA" />
            <TrustItem icon={<ShieldCheck className="h-4 w-4" />} text="Détection de manipulation" />
            <TrustItem icon={<Video className="h-4 w-4" />} text="Vidéo en direct 60s" />
            <TrustItem icon={<Award className="h-4 w-4" />} text="Trust Score" />
            <TrustItem icon={<ShieldCheck className="h-4 w-4" />} text="Signalement communautaire" />
            <TrustItem icon={<Award className="h-4 w-4" />} text="Alertes IA intelligentes" />
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <Link href="/register">
            <Button size="lg">
              Commencer maintenant
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
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
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 flex gap-4 hover:border-[var(--gold)] transition-colors">
      <div className="shrink-0 h-12 w-12 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center font-extrabold text-lg">
        {num}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--gold)]">{icon}</span>
          <h3 className="font-bold">{title}</h3>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">{text}</p>
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
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] p-3 flex items-center gap-2">
      <span className="text-[var(--gold)] shrink-0">{icon}</span>
      <span className="text-sm font-semibold">{text}</span>
    </div>
  );
}
