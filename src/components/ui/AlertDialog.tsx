"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/lib/scrollLock";
import { AlertTriangle, XCircle, Info, ArrowRight, X } from "lucide-react";

/**
 * The one place the app says "this went wrong".
 *
 * Errors used to appear wherever the screen that produced them happened to put
 * them: a toast pinned to the top, a red panel under a form the user had
 * already scrolled past. On the publish page that meant a list of four missing
 * fields sitting below the fold — you pressed the button, nothing visibly
 * happened, and the reason was off screen.
 *
 * So an error is a dialog: centred in the viewport, over everything, holding
 * focus until it is acknowledged. It cannot be missed and it cannot be
 * scrolled away from.
 *
 * When the problem is a set of fields, each one is a BUTTON that takes the
 * user to it — `fieldId` points at any element; the dialog scrolls it into the
 * middle of the screen, focuses the first control inside it, and flashes a
 * ring so the eye lands in the right place.
 */

export type AlertItem = {
  label: string;
  /** id of the element to jump to when this line is clicked. */
  fieldId?: string;
};

export type AlertPayload = {
  title: string;
  body?: string;
  items?: AlertItem[];
  /**
   * Called with the `fieldId` when a line is tapped, on top of the scroll.
   * The dialog can only flash a field for a second; a form that keeps its own
   * idea of what is still missing uses this to mark it red and leave it red
   * until it is filled.
   */
  onJump?: (fieldId: string) => void;
  variant?: "error" | "warning" | "info";
  /** Label for the dismiss button. Defaults to "J'ai compris". */
  confirmLabel?: string;
};

const TONE = {
  error: { Icon: XCircle, ring: "ring-[var(--danger)]/30", fg: "text-[var(--danger)]", bg: "bg-[var(--danger)]/10" },
  warning: { Icon: AlertTriangle, ring: "ring-amber-400/30", fg: "text-amber-400", bg: "bg-amber-400/10" },
  info: { Icon: Info, ring: "ring-[var(--gold)]/30", fg: "text-[var(--gold)]", bg: "bg-[var(--gold)]/10" },
} as const;

/** Scroll to a field, focus it, and flash it so the eye finds it. */
export function goToField(fieldId: string, tone: "gold" | "danger" = "gold") {
  const run = (attempt = 0) => {
    const el = document.getElementById(fieldId);
    if (!el) return;

    // The dialog locks body scrolling while it is open. Its cleanup runs on
    // unmount, which can land AFTER this callback — scrolling a still-locked
    // document silently does nothing, which is exactly what it did. Wait for
    // the document to be scrollable again before moving.
    const locked = getComputedStyle(document.body).overflow === "hidden";
    if (locked && attempt < 12) {
      window.setTimeout(() => run(attempt + 1), 40);
      return;
    }

    // Absolute position rather than scrollIntoView: it centres the field the
    // same way on every browser, and it is unaffected by the sticky header.
    const rect = el.getBoundingClientRect();
    const target = rect.top + window.scrollY - Math.max(0, window.innerHeight / 2 - rect.height / 2);
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });

    const focusable = el.matches("input, textarea, select, button")
      ? (el as HTMLElement)
      : el.querySelector<HTMLElement>("input, textarea, select, button");

    window.setTimeout(() => {
      // Belt and braces. window.scrollTo is the nicest of the three (one
      // smooth move, field centred) but it is silently a no-op wherever the
      // document is not the scroller. If the field is still off screen, let
      // scrollIntoView find the right scroller, and finally let focus() do it
      // — focus WITHOUT preventScroll drags the field into view by itself.
      const box = el.getBoundingClientRect();
      const visible = box.top >= 0 && box.bottom <= window.innerHeight;
      if (!visible) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        focusable?.focus();
      } else {
        focusable?.focus({ preventScroll: true });
      }
    }, 400);

    // Red when the dialog is reporting a problem — a gold flash on a field
    // the seller was just told is missing reads as decoration, not as "this
    // one".
    const cls = tone === "danger" ? "batta-field-flash-danger" : "batta-field-flash";
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), 1600);
  };
  run();
}

export function AlertDialog({
  payload,
  onClose,
}: {
  payload: AlertPayload;
  onClose: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setMounted(true), []);

  // An alert almost always opens OVER something else — see scrollLock.
  useScrollLock(true);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard and screen-reader users land here.
    window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;
  const tone = TONE[payload.variant ?? "error"];
  const { Icon } = tone;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={payload.title}
      // z-[200]: above the toast stack (100), the bottom bar (40) and every
      // sticky CTA on the page. Nothing outranks an error.
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`batta-alert-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] outline-none ring-1 ${tone.ring}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>

        <div className={`inline-flex size-12 items-center justify-center rounded-2xl ${tone.bg} ${tone.fg}`}>
          <Icon className="size-6" strokeWidth={2.2} />
        </div>

        <h2 className="mt-4 text-[18px] font-extrabold leading-tight text-foreground">
          {payload.title}
        </h2>
        {payload.body && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{payload.body}</p>
        )}

        {payload.items && payload.items.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {payload.items.map((item, i) =>
              item.fieldId ? (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      const id = item.fieldId!;
                      payload.onJump?.(id);
                      onClose();
                      // after the dialog unmounts, so the scroll is not undone
                      window.setTimeout(
                        () => goToField(id, payload.variant === "info" ? "gold" : "danger"),
                        30,
                      );
                    }}
                    className="tap-target group flex w-full items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-start text-[13px] font-semibold text-foreground transition hover:bg-[var(--gold-faint)]"
                  >
                    <span className="flex-1">{item.label}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-[var(--gold)]" />
                  </button>
                </li>
              ) : (
                <li
                  key={i}
                  className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-foreground/85"
                >
                  {item.label}
                </li>
              ),
            )}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="batta-btn-luxe tap-target mt-5 inline-flex h-11 w-full items-center justify-center text-[14px]"
        >
          {payload.confirmLabel ?? "J'ai compris"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
