"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ChevronLeft, X } from "lucide-react";
import { Stepper } from "./Stepper";

const steps = [
  { label: "Données" },
  { label: "Photos" },
  { label: "Vidéo" },
  { label: "Propriété" },
  { label: "Prix" },
];

interface Props {
  current: number;
  children: React.ReactNode;
}

export function CreateAuctionShell({ current, children }: Props) {
  const router = useRouter();
  const tCommon = useTranslations("common");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="h-12 w-12 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <div className="font-bold text-sm">Créer une nouvelle enchère</div>
        <button
          onClick={() => router.push("/seller/dashboard")}
          aria-label={tCommon("cancel")}
          className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--danger)]/40 hover:text-[var(--danger)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="px-4 pb-4">
        <Stepper steps={steps} current={current} />
      </div>

      <main className="flex-1 px-4 max-w-[var(--max-w)] mx-auto w-full pb-32">
        {children}
      </main>
    </div>
  );
}
