import { Search, Gavel, Trophy } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Découvrir",
    text: "Parcourez des milliers de voitures vérifiées de vendeurs authentifiés grâce à des filtres précis.",
  },
  {
    icon: Gavel,
    title: "Enchérir",
    text: "Payez seulement 5% de caution, puis enchérissez en confiance. Système d'enchères instantané et fiable.",
  },
  {
    icon: Trophy,
    title: "Gagner",
    text: "Si vous gagnez, vous contactez directement le vendeur. Sinon, votre caution est remboursée automatiquement.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-12 md:py-20">
      <div className="max-w-[var(--max-w)] mx-auto px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--gold-faint)] text-[var(--gold-bright)] text-xs font-semibold mb-3">
Comment ça marche ?
          </div>
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">
            Trois étapes simples
          </h2>
          <p className="text-[var(--foreground-muted)] mt-2 max-w-md mx-auto">
            De la recherche à la victoire — une expérience fluide et 100% fiable
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={i}
                className="relative p-6 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)] transition-colors group"
              >
                {/* Number */}
                <div className="absolute top-4 start-4 text-5xl font-black text-[var(--gold)]/10 group-hover:text-[var(--gold)]/20 transition-colors">
                  0{i + 1}
                </div>

                <div className="relative">
                  <div className="h-12 w-12 rounded-[var(--radius)] bg-[var(--gold-faint)] flex items-center justify-center text-[var(--gold-bright)] mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-xl mb-2">{step.title}</h3>
                  <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
                    {step.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
