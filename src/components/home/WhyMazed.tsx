import {
  ShieldCheck,
  Camera,
  Gavel,
  Banknote,
  Eye,
  RefreshCw,
} from "lucide-react";

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "9 Couches de vérification",
    text: "Identité, propriété, photos, vidéo — tout est vérifié avant la publication",
  },
  {
    icon: Camera,
    title: "Photos et vidéo authentifiées",
    text: "12 photos + vidéo de 60 secondes obligatoires pour chaque enchère",
  },
  {
    icon: Gavel,
    title: "Enchères en temps réel",
    text: "Mises à jour en direct avec anti-sniping automatique",
  },
  {
    icon: Banknote,
    title: "Caution de 5% seulement",
    text: "Une petite caution, intégralement remboursée si vous ne gagnez pas",
  },
  {
    icon: Eye,
    title: "Transparence totale",
    text: "Historique des offres et profil du vendeur accessibles à tous",
  },
  {
    icon: RefreshCw,
    title: "Remboursement Auto",
    text: "Les cautions des perdants sont remboursées sous 24 heures",
  },
];

export function WhyMazed() {
  return (
    <section className="py-12 md:py-16 border-y border-[var(--border)] bg-[var(--surface)]/40">
      <div className="max-w-[var(--max-w)] mx-auto px-4">
        <div className="text-center mb-8">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--gold)] mb-2">
Pourquoi Mazed
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Confiance bâtie sur{" "}
            <span className="gradient-gold-text">Couches de vérification</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--gold)]/30 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/20 flex items-center justify-center text-[var(--gold)] mb-3">
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="font-bold text-sm mb-1">{p.title}</div>
                <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                  {p.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
