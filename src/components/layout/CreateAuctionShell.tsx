"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ChevronLeft,
  X,
  Check,
  Car,
  Camera,
  Video,
  ShieldCheck,
  Tag,
  ShieldAlert,
} from "lucide-react";
import { Stepper } from "./Stepper";
import type { LucideIcon } from "lucide-react";

const steps: { label: string; sub: string; Icon: LucideIcon }[] = [
  { label: "Données", sub: "Marque, année, état", Icon: Car },
  { label: "Photos", sub: "12 angles requis", Icon: Camera },
  { label: "Vidéo", sub: "60 s · tour complet", Icon: Video },
  { label: "Propriété", sub: "Carte grise", Icon: ShieldCheck },
  { label: "Prix", sub: "Départ, réserve, durée", Icon: Tag },
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
      {/* ============================================================
          MOBILE header — original chrome, untouched.
          ============================================================ */}
      <header className="lg:hidden flex items-center justify-between px-4 pt-4 pb-3">
        {current > 0 ? (
          <button
            onClick={() => router.back()}
            aria-label={tCommon("back")}
            className="h-12 w-12 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>
        ) : (
          <span className="h-12 w-12 shrink-0" aria-hidden />
        )}
        <div className="font-bold text-sm">Créer une nouvelle enchère</div>
        <button
          onClick={() => router.push("/profile")}
          aria-label={tCommon("cancel")}
          className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--danger)]/40 hover:text-[var(--danger)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="lg:hidden px-4 pb-4">
        <Stepper steps={steps} current={current} />
      </div>

      <main className="lg:hidden flex-1 px-4 max-w-[var(--max-w)] mx-auto w-full pb-32">
        {children}
      </main>

      {/* ============================================================
          DESKTOP — top app bar + 2-col split: vertical stepper sidebar
          on the start, content panel on the end.

          Layout:
            ┌──── top bar (h-16) ─────────────────────────┐
            │ [logo] · Créer une enchère       · [exit]  │
            ├──────────────────┬──────────────────────────┤
            │ Stepper sidebar  │  Step content panel      │
            │ (sticky)         │  (scrollable)            │
            │                  │                          │
            └──────────────────┴──────────────────────────┘
          ============================================================ */}
      <div className="hidden lg:flex lg:flex-col lg:min-h-screen">
        <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-[var(--border)]">
          <div className="max-w-[var(--max-w-wide)] mx-auto px-8 h-16 flex items-center gap-6">
            {current > 0 && (
              <button
                onClick={() => router.back()}
                aria-label={tCommon("back")}
                className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              </button>
            )}
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div className="font-extrabold tracking-tight text-lg gradient-gold-text">
                Mazed Auto
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
                Vendeur
              </div>
              <div className="mt-0.5 text-base font-black tracking-tight">
                Créer une nouvelle enchère
              </div>
            </div>
            <button
              onClick={() => router.push("/profile")}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--danger)]/50 hover:text-[var(--danger)] text-sm font-bold transition-colors"
            >
              <X className="h-4 w-4" />
              Quitter
            </button>
          </div>
        </header>

        <div className="flex-1 max-w-[var(--max-w-wide)] mx-auto w-full px-8 py-10">
          <div className="grid grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr] gap-10 xl:gap-14 items-start">
            {/* ── Stepper sidebar ── */}
            <aside className="sticky top-[calc(4rem+1.5rem)] self-start">
              <div className="rounded-[24px] bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
                <div className="px-6 py-5 border-b border-[var(--border)]">
                  <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                    Progression
                  </div>
                  <div className="mt-1.5 text-2xl font-black tabular-nums">
                    Étape {current + 1}
                    <span className="text-[var(--foreground-muted)] font-light text-base">
                      {" "}
                      / {steps.length}
                    </span>
                  </div>
                </div>

                <ul className="p-3 space-y-1">
                  {steps.map((step, i) => {
                    const done = i < current;
                    const active = i === current;
                    const pending = i > current;
                    const StepIcon = step.Icon;
                    return (
                      <li key={i}>
                        <div
                          className={[
                            "flex items-center gap-3 px-3 py-3 rounded-xl transition-colors",
                            active && "bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30",
                            done && "text-foreground",
                            pending && "opacity-55",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span
                            className={[
                              "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                              active &&
                                "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]",
                              done && "bg-[var(--gold)]/20 text-[var(--gold)]",
                              pending &&
                                "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {done ? (
                              <Check className="h-4 w-4" strokeWidth={3} />
                            ) : (
                              <StepIcon className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] tabular-nums font-bold text-[var(--foreground-subtle)]">
                                {i + 1}.
                              </span>
                              <div
                                className={[
                                  "text-sm font-bold leading-tight",
                                  active && "text-[var(--gold)]",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {step.label}
                              </div>
                            </div>
                            <div className="text-[11px] text-[var(--foreground-muted)] leading-tight mt-0.5">
                              {step.sub}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-2)]/40 flex items-start gap-3">
                  <ShieldAlert className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
                  <div className="text-[11px] text-[var(--foreground-muted)] leading-relaxed">
                    Toutes les enchères passent par notre équipe avant
                    publication — KYC humain, photos vérifiées.
                  </div>
                </div>
              </div>
            </aside>

            {/* ── Step content panel ── */}
            <main className="min-w-0">
              <div className="rounded-[24px] bg-[var(--surface)] ring-1 ring-[var(--border)] p-8 xl:p-10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)]">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
