"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Top-right anchored panel; on mobile it slides down as a top sheet. */
  children: React.ReactNode;
  /** Optional aria-label for the panel itself. */
  label?: string;
}

/**
 * Header-anchored popover. Top-right panel on desktop (lg+), top sheet
 * sliding down from under the header on mobile. Closes on outside click
 * and Escape. Rendered through a portal so an ancestor's `transform` or
 * `backdrop-filter` (sticky header etc.) doesn't break positioning.
 *
 * Lighter-weight than the generic centered Modal — no body scroll-lock,
 * no focus trap. The bell + messages popups are non-destructive read-only
 * surfaces, so trapping focus is overkill and was making the click-out
 * dismissal feel sluggish.
 */
export function HeaderPopover({ open, onClose, children, label }: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* Click-through scrim — transparent on desktop so the page stays
          visible behind the panel; a soft tint on mobile so the sheet
          reads as a distinct surface against the underlying scroll. */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-transparent lg:bg-transparent bg-black/40"
      />

      <div
        className={cn(
          "absolute bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden flex flex-col",
          // Mobile (default) — full-width top sheet sliding down from the
          // top of the viewport, no horizontal margin so it reads as a
          // continuation of the header.
          "inset-x-0 top-[var(--header-h,56px)] rounded-b-[var(--radius-md)] max-h-[80vh] animate-in slide-in-from-top-2 fade-in",
          // Desktop (lg+) — anchored to the top-right under the header.
          // 420px wide is enough for two-line message previews without
          // dominating the page. 8px gap from the header bottom + edge
          // mirrors typical desktop dropdown padding.
          "lg:inset-auto lg:end-4 xl:end-8 lg:top-[calc(var(--header-h,64px)+8px)] lg:w-[420px] lg:rounded-[var(--radius-md)] lg:max-h-[640px]",
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
