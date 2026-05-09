"use client";

import { Link } from "@/i18n/navigation";
import {
  ShieldCheck,
  Sun,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";

export default function KYCStartPage() {
  return (
    // current=-1 hides the stepper — this is the prep screen, before step 1
    <KYCShell current={-1} title="Avant de commencer">
      <div className="space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto h-16 w-16 rounded-full bg-[var(--gold-faint)] flex items-center justify-center shadow-[var(--shadow-gold)]">
            <ShieldCheck className="h-7 w-7 text-[var(--gold)]" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Vérifiez votre identité</h1>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mt-2">
~ Deux minutes seulement. Nous le faisons une seule fois pour protéger les acheteurs et vendeurs.
            </p>
          </div>
        </div>

        {/* Prerequisites — what the user needs in hand BEFORE starting */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-2">
Ayez avec vous
          </div>
          <ul className="space-y-2">
            <Prep
              icon={<CreditCard className="h-4 w-4" />}
              title="Carte d'identité nationale valide"
              text="Le recto et le verso doivent être nets"
            />
            <Prep
              icon={<Sun className="h-4 w-4" />}
              title="Bon éclairage"
              text="Évitez les reflets et les ombres sur la carte"
            />
          </ul>
        </div>

        {/* Step preview — gives a sense of what's coming */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-3">
            Étapes
          </div>
          <ol className="space-y-2.5 text-sm">
            <PreviewStep num={1} label="Recto de la carte" />
            <PreviewStep num={2} label="Verso de la carte" />
            <PreviewStep num={3} label="Selfie en direct (rotation de la tête + sourire)" />
            <PreviewStep num={4} label="Vérification automatique" highlight />
          </ol>
        </div>

        <Link href="/kyc/id-front" className="block">
          <Button size="xl" fullWidth>
            Commencer maintenant
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </KYCShell>
  );
}

function Prep({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)]">
      <div className="shrink-0 h-9 w-9 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{title}</div>
        <div className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
          {text}
        </div>
      </div>
    </li>
  );
}

function PreviewStep({
  num,
  label,
  highlight,
}: {
  num: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0 ${
          highlight
            ? "bg-[var(--gold)] text-black"
            : "bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]"
        }`}
      >
        {num}
      </div>
      <span className={highlight ? "font-semibold" : "text-[var(--foreground-muted)]"}>
        {label}
      </span>
    </li>
  );
}
