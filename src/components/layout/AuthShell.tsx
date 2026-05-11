"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ChevronLeft,
  ShieldCheck,
  Camera,
  Gavel,
  Banknote,
  Sparkles,
} from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Where the back arrow goes — defaults to home */
  backHref?: string;
}

const TRUST_PILLARS = [
  {
    Icon: ShieldCheck,
    title: "KYC humain",
    text: "Identité vérifiée à la main avant tout achat ou vente",
  },
  {
    Icon: Camera,
    title: "12 photos + vidéo",
    text: "Imposées avant publication — pas de mauvaise surprise",
  },
  {
    Icon: Banknote,
    title: "Caution 5 %",
    text: "Remboursée sous 24 h si vous ne gagnez pas",
  },
  {
    Icon: Gavel,
    title: "Anti-sniping",
    text: "Prolongation auto à la dernière minute",
  },
];

/**
 * Auth shell — same component, two layouts:
 *   Mobile (<lg): app-style flow — back arrow + brand row + headline + form
 *     in a narrow column. Untouched from before.
 *   Desktop (lg+): magazine split-screen — marketing pane on the start
 *     (brand, value proposition, trust pillars) + form card on the end.
 *     Used by login, register, forgot-password, reset-password.
 */
export function AuthShell({ title, subtitle, children, footer, backHref = "/" }: Props) {
  const tCommon = useTranslations("common");
  const tBrand = useTranslations("brand");
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ============================================================
          MOBILE — unchanged compact layout
          ============================================================ */}
      <div className="lg:hidden flex flex-col flex-1">
        <div className="flex items-center justify-between px-4 pt-4">
          <Link
            href={backHref}
            aria-label={tCommon("back")}
            className="h-12 w-12 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label={tBrand("name")}
          >
            <div className="h-8 w-8 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30 shadow-[var(--shadow-gold)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </div>
          </Link>
        </div>

        <div className="flex-1 px-5 pt-8 pb-10 max-w-[var(--max-w)] w-full mx-auto">
          <div className="space-y-2 mb-7">
            <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {children}

          {footer && (
            <div className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          DESKTOP — magazine 2-col split. Marketing pane left, form right.
          ============================================================ */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:flex-1 lg:min-h-screen">
        {/* ── Marketing pane ── */}
        <aside className="relative overflow-hidden bg-gradient-to-br from-[#1a1408] via-[var(--surface)] to-black p-12 xl:p-16 flex flex-col">
          {/* Decorative gold accents */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -end-32 h-96 w-96 rounded-full bg-[var(--gold)] blur-3xl opacity-15"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -start-40 h-[28rem] w-[28rem] rounded-full bg-[var(--gold)] blur-3xl opacity-10"
          />

          {/* Brand */}
          <Link
            href="/"
            className="relative inline-flex items-center gap-3 shrink-0"
            aria-label={tBrand("name")}
          >
            <div className="h-12 w-12 rounded-full overflow-hidden ring-2 ring-[var(--gold)]/40 shadow-[var(--shadow-gold)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="font-black tracking-tight text-2xl gradient-gold-text">
              {tBrand("name")}
            </div>
          </Link>

          {/* Hero copy — flexed to vertical center */}
          <div className="relative flex-1 flex flex-col justify-center max-w-lg">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              <Sparkles className="h-3.5 w-3.5" />
              Enchères vérifiées · Tunisie
            </div>
            <h2 className="mt-3 text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
              La plateforme intelligente d&apos;
              <span className="gradient-gold-text">enchères automobiles</span>
            </h2>
            <p className="mt-4 text-base text-[var(--foreground-muted)] leading-relaxed">
              Achetez ou vendez votre voiture en toute confiance. Identités
              vérifiées des deux côtés, dépôt sécurisé, livraison encadrée.
            </p>

            {/* Trust pillars */}
            <ul className="mt-8 grid grid-cols-2 gap-4 xl:gap-5">
              {TRUST_PILLARS.map(({ Icon, title: t, text }) => (
                <li
                  key={t}
                  className="rounded-2xl bg-[var(--surface)]/60 ring-1 ring-[var(--border)] p-4 backdrop-blur-md"
                >
                  <span className="h-9 w-9 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="mt-3 text-sm font-extrabold leading-tight">
                    {t}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--foreground-muted)] leading-snug">
                    {text}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer signature */}
          <div className="relative shrink-0 text-[11px] text-[var(--foreground-subtle)]">
            © {new Date().getFullYear()} Mazed Auto · Tunis
          </div>
        </aside>

        {/* ── Form pane ── */}
        <main className="flex items-center justify-center p-12 xl:p-16 bg-background">
          <div className="w-full max-w-md">
            <div className="space-y-2 mb-8">
              <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
                {title}
              </h1>
              {subtitle && (
                <p className="text-base text-[var(--foreground-muted)] leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>

            {children}

            {footer && (
              <div className="mt-8 text-center text-sm text-[var(--foreground-muted)]">
                {footer}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
