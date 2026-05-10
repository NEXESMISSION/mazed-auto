"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, X } from "lucide-react";
import { Stepper } from "./Stepper";

const steps = [
  { label: "Recto de la carte" },
  { label: "Verso de la carte" },
  { label: "Selfie" },
  { label: "Vérification" },
];

interface Props {
  /** 0 = front, 1 = back, 2 = selfie, 3 = verify. -1 hides stepper (intro/status). */
  current: number;
  children: React.ReactNode;
  backHref?: string;
  title?: string;
}

/**
 * Client component for the same reason as AuthShell — the KYC step pages
 * (id-front, id-back, selfie, processing) are "use client" because they
 * use useState/useRouter for the camera flow, and rendering an async
 * server shell from a client tree breaks Next 16.
 */
export function KYCShell({
  current,
  children,
  backHref = "/",
  title = "Vérification d'identité",
}: Props) {
  const tCommon = useTranslations("common");
  const showStepper = current >= 0;
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 pt-4 pb-1">
        <Link
          href={backHref}
          aria-label={tCommon("back")}
          className="h-12 w-12 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </Link>
        <div className="font-bold text-sm">{title}</div>
        <Link
          href="/"
          aria-label={tCommon("cancel")}
          className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--danger)]/40 hover:text-[var(--danger)] transition-colors"
        >
          <X className="h-4 w-4" />
        </Link>
      </header>

      {showStepper && (
        <div className="px-4 pb-3">
          <Stepper steps={steps} current={current} />
        </div>
      )}

      <main className="flex-1 px-4 py-2 max-w-[var(--max-w)] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
