"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MessageSquare, Mail, Phone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Comment commencer en tant que vendeur ?",
    a: "Créez un compte, terminez le KYC (deux minutes), puis cliquez sur '+ Nouvelle enchère' pour suivre les 5 étapes : données du véhicule, 12 photos, vidéo de 60s, carte grise, prix.",
  },
  {
    q: "Combien coûte la commission Mazed ?",
    a: "7% du prix de vente final, plafonnée à 15 000 DT par vente, prélevée sur le vendeur lors de la finalisation réussie de la vente.",
  },
  {
    q: "Que se passe-t-il si je ne gagne pas l'enchère ?",
    a: "La caution de participation (5%) est intégralement remboursée sur votre compte sous 24 heures, via le même moyen de paiement utilisé.",
  },
  {
    q: "La vérification d'identité est-elle obligatoire ?",
    a: "Oui pour tout vendeur. Optionnelle pour les acheteurs, mais les acheteurs vérifiés bénéficient d'un Trust Score plus élevé et d'une meilleure expérience.",
  },
  {
    q: "Qu'est-ce que le Trust Score ?",
    a: "Un système intelligent de points calculé pour chaque vendeur en fonction de son comportement. Il démarre après le KYC et augmente à chaque vente réussie et évaluation positive.",
  },
  {
    q: "Que faire si je suspecte une fraude ?",
    a: "Cliquez sur 🚩 sur n'importe quelle enchère pour la signaler. Notre équipe examine les signalements sous 24 heures et au-delà de certains seuils, l'enchère est annulée automatiquement.",
  },
  {
    q: "Puis-je me retirer après avoir gagné ?",
    a: "Techniquement oui, mais votre caution sera saisie (70% pour le vendeur + 30% pour la plateforme), vous serez banni 30 jours, et 40 points seront déduits de votre Trust Score.",
  },
  {
    q: "Quelle est la durée de validité du KYC ?",
    a: "Un an à partir de la date de vérification. Vous recevrez des alertes 30 jours avant l'expiration pour le renouveler.",
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-[26px] font-extrabold tracking-tight">Centre d'aide</h1>
          <p className="text-[var(--foreground-muted)]">
            Tout ce que vous devez savoir sur Mazed Auto
          </p>
        </header>

        {/* FAQ */}
        <section className="space-y-2">
          <h2 className="font-bold text-lg">Questions fréquentes</h2>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            {faqs.map((f, i) => (
              <details
                key={i}
                open={open === i}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(open === i ? null : i);
                }}
                className="group"
              >
                <summary className="p-4 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-[var(--surface-2)]">
                  <span className="font-semibold text-sm flex-1">{f.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--foreground-muted)] transition-transform",
                      open === i && "rotate-180",
                    )}
                  />
                </summary>
                <div className="px-4 pb-4 text-sm text-[var(--foreground-muted)] leading-relaxed">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="space-y-2">
          <h2 className="font-bold text-lg">Vous n'avez pas trouvé de réponse ? Contactez-nous</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ContactCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Chat en direct"
              text="9h - 18h, 7j/7"
              action="Démarrer le chat"
            />
            <ContactCard
              icon={<Mail className="h-5 w-5" />}
              title="E-mail"
              text="support@mazedauto.tn"
              action="Nous écrire"
            />
            <ContactCard
              icon={<Phone className="h-5 w-5" />}
              title="Téléphone"
              text="+216 70 100 200"
              action="Appeler"
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ContactCard({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--gold)] transition-colors">
      <div className="h-10 w-10 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{text}</div>
      <Link
        href="#"
        className="inline-block mt-2 text-xs text-[var(--gold)] font-semibold hover:underline"
      >
        {action} ←
      </Link>
    </div>
  );
}
