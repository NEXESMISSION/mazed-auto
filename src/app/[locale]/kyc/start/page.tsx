"use client";

import { Link } from "@/i18n/navigation";
import { ShieldCheck, ArrowRight, Lock, CreditCard, Sun } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";

/**
 * KYC entry / consent surface. One premium card, vertically centered
 * in the shell so the page doesn't slump to the top with empty space
 * beneath it — gold accents on the dark card.
 *
 * Layout: hairline-topped card holding shield + headline + info pill +
 * prerequisites + 4-step preview + CTA (v1's structure). A single
 * legal line sits below the card.
 */
export default function KYCStartPage() {
  return (
    <KYCShell current={-1} title="Vérification d'identité">
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center py-6">
        <section className="relative w-full overflow-hidden rounded-3xl bg-[var(--surface)] p-8 ring-1 ring-[var(--border)] shadow-[0_30px_80px_-30px_rgba(30,58,138,0.18)] lg:p-12">
          {/* Top hairline accent — the only chrome the card needs. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent"
          />

          <div className="flex flex-col items-center text-center">
            {/* Shield — navy gradient (the brand fill) + soft halo. */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-5 rounded-full bg-[var(--gold)]/20 blur-2xl"
              />
              <div className="batta-gold-fill relative grid size-16 place-items-center rounded-2xl text-white shadow-[var(--shadow-gold)] ring-1 ring-black/5">
                <ShieldCheck className="size-8" strokeWidth={2} />
              </div>
            </div>

            <h1 className="mt-6 text-[26px] font-extrabold leading-[1.1] tracking-tight lg:text-[30px]">
              Vérifions votre{" "}
              <span className="gradient-gold-text">identité</span>
            </h1>
            <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[var(--foreground-muted)]">
              Débloquez enchères et ventes.
            </p>

            {/* Info pill — solid gold, black ink for contrast. */}
            <span className="batta-tabular mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-black shadow-[var(--shadow-gold)]">
              4 étapes · ~2 min
            </span>

            {/* Prerequisites + step preview — v1's checklist so the user
                knows what to grab before starting. */}
            <div className="mt-6 w-full max-w-[320px] space-y-2 text-start">
              <div className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 ring-1 ring-[var(--border)]">
                <CreditCard className="size-4 shrink-0 text-[var(--gold)]" strokeWidth={2} />
                <span className="text-[12px] text-[var(--foreground-muted)]">
                  Votre carte d&apos;identité (CIN) à portée de main
                </span>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 ring-1 ring-[var(--border)]">
                <Sun className="size-4 shrink-0 text-[var(--gold)]" strokeWidth={2} />
                <span className="text-[12px] text-[var(--foreground-muted)]">
                  Un endroit bien éclairé pour les photos
                </span>
              </div>
            </div>

            <ol className="mt-4 w-full max-w-[320px] space-y-1.5 text-start">
              {[
                "Recto de la carte d'identité",
                "Verso de la carte d'identité",
                "Selfie de vérification",
                "Confirmation",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-2.5 text-[12px] text-[var(--foreground-muted)]">
                  <span className="batta-tabular inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--gold-faint)] text-[10px] font-extrabold text-[var(--gold)] ring-1 ring-[var(--gold)]/25">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <Link
              href="/kyc/id-front"
              className="batta-gradient-gold mt-7 inline-flex h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-full text-[14px] font-extrabold uppercase tracking-[0.12em] text-black shadow-[var(--shadow-gold)] ring-1 ring-black/10 transition active:scale-[0.98]"
            >
              Commencer
              <ArrowRight className="size-4" strokeWidth={2.6} />
            </Link>

            <Link
              href="/"
              className="mt-3 inline-flex h-10 w-full max-w-[280px] items-center justify-center rounded-full text-[13px] font-semibold text-[var(--foreground-muted)] transition hover:text-foreground"
            >
              Peut-être plus tard
            </Link>
          </div>
        </section>

        <p className="mt-5 flex items-center justify-center gap-1.5 px-3 text-center text-[10.5px] text-[var(--foreground-muted)]">
          <Lock className="size-3 shrink-0" strokeWidth={2.5} />
          Données chiffrées · loi tunisienne n°2004-63
        </p>
      </div>
    </KYCShell>
  );
}
