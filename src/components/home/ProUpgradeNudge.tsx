"use client";

import { useEffect, useState } from "react";
import { Crown, Sparkles, X, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Bottom-sheet popup that nudges non-Pro users toward /pricing. Behaviour:
 *
 *   - Only renders for signed-in non-Pro users (gated by the `enabled`
 *     prop the server passes down — keeps the check out of the client).
 *   - Appears after ~25s of being on the page, so it doesn't interrupt
 *     the first impression.
 *   - Dismissible. After dismissal, suppressed for 7 days via
 *     localStorage; after a "Voir les plans" click, suppressed forever
 *     on that browser (user has been there, no need to keep asking).
 *   - Slides up from the bottom on mobile, sits as a toast in the
 *     bottom-end corner on desktop.
 */
const SHOW_AFTER_MS = 25_000;
const DISMISS_COOLDOWN_DAYS = 7;
const STORAGE_KEY = "mz_pro_nudge_v1";

type Suppression = { until: number };

function readSuppression(): Suppression | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Suppression;
  } catch {
    return null;
  }
}

function writeSuppression(days: number | "forever") {
  if (typeof window === "undefined") return;
  const until =
    days === "forever"
      ? Number.MAX_SAFE_INTEGER
      : Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ until }));
  } catch {
    // localStorage full / blocked — fine, we just show the nudge again
    // next visit.
  }
}

export function ProUpgradeNudge({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const sup = readSuppression();
    if (sup && Date.now() < sup.until) return;
    const t = setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [enabled]);

  if (!enabled || !open) return null;

  function dismiss() {
    writeSuppression(DISMISS_COOLDOWN_DAYS);
    setOpen(false);
  }
  function ack() {
    // User clicked through — stop nagging them.
    writeSuppression("forever");
    setOpen(false);
  }

  return (
    <>
      {/* Backdrop (mobile only — desktop is a side toast, no overlay) */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
      />

      <div
        role="dialog"
        aria-label="Passer au compte professionnel"
        className="
          fixed z-50
          inset-x-3 bottom-[calc(var(--bottombar-h)+env(safe-area-inset-bottom)+12px)]
          md:inset-x-auto md:bottom-6 md:end-6 md:max-w-sm
          rounded-[20px] overflow-hidden
          bg-gradient-to-br from-[#1a1408] via-[var(--surface)] to-[var(--surface)]
          ring-1 ring-[var(--gold)]/40
          shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]
          animate-in slide-in-from-bottom-4 duration-300
        "
      >
        {/* Decorative glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -end-12 h-40 w-40 rounded-full bg-[var(--gold)] blur-3xl opacity-15"
        />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="absolute top-2 end-2 h-8 w-8 rounded-full bg-black/30 hover:bg-black/60 text-white/80 hover:text-white flex items-center justify-center transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-4 pe-10">
          <div className="flex items-start gap-3">
            <span className="h-11 w-11 shrink-0 rounded-xl bg-[var(--gold)] text-black flex items-center justify-center shadow-[var(--shadow-gold)]">
              <Crown className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-extrabold text-[var(--gold)]">
                <Sparkles className="h-3 w-3" />
                Vendeur Pro
              </div>
              <h3 className="mt-1 text-[15px] font-extrabold tracking-tight leading-tight">
                Vendez plus de voitures
              </h3>
              <p className="mt-1 text-[12px] text-[var(--foreground-muted)] leading-snug">
                Boutique brandée, badge confiance, placement prioritaire et
                analytiques. Sans engagement.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="h-10 px-3 rounded-full text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-foreground transition-colors"
            >
              Plus tard
            </button>
            <Link
              href="/pricing"
              onClick={ack}
              className="flex-1 h-10 rounded-full bg-[var(--gold)] text-black font-extrabold text-[13px] shadow-[var(--shadow-gold)] inline-flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.99] transition-transform"
            >
              Voir les plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
