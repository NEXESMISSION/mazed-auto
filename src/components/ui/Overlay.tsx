"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/lib/scrollLock";

/**
 * Every layer that sits on top of the page comes through here.
 *
 * Before this each one invented its own: the confirm modal at z-50, the promo
 * popup at 80, the document viewer at 100, the lightbox and the alert dialog
 * BOTH at 200 (so which one won was down to render order), backdrops between
 * black/60 and black/90, and the mobile filter sheet sliding in from the side
 * while everything else was centred. Same product, five different physics.
 *
 * One primitive, one ladder:
 *
 *   LAYER.sheet   40   page furniture that can be covered
 *   LAYER.modal   80   confirmations, forms, the filter sheet
 *   LAYER.viewer 120   full-bleed media (photo, PDF)
 *   LAYER.alert  200   errors — nothing outranks an error
 *
 * Centred on both axes at every width, dimmed and blurred behind, scroll
 * locked, Escape and backdrop close, focus moved in.
 */
export const LAYER = { sheet: 40, modal: 80, viewer: 120, alert: 200 } as const;

export function Overlay({
  open,
  onClose,
  z = LAYER.modal,
  labelledBy,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  z?: number;
  labelledBy?: string;
  /** Classes for the PANEL, not the backdrop. */
  className?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setMounted(true), []);

  // Shared, reference-counted: nested overlays cannot strand the page.
  useScrollLock(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => panel.current?.focus(), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div aria-hidden className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panel}
        tabIndex={-1}
        className={`batta-alert-in relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-3xl bg-surface shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] outline-none ring-1 ring-border ${className || "max-w-md p-6"}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
