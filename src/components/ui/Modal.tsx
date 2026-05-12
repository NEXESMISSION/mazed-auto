"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** When true, renders as a bottom-sheet on mobile */
  mobileSheet?: boolean;
}

const sizeMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  mobileSheet = true,
}: ModalProps) {
  const tCommon = useTranslations("common");
  // Track when we're mounted on the client so the SSR pass can return
  // null (createPortal needs a real DOM target).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Refs for focus management — the element that had focus before we
  // opened, and the modal's surface so we can scope focus into it.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    // Snapshot the element that had focus when the modal opened so we
    // can restore it on close — keyboard / screen-reader users expect
    // to land back on the button that triggered the modal.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the modal on the next tick (after createPortal
    // has mounted children). Falls back to the dialog container itself
    // when there are no focusable descendants.
    const moveFocus = () => {
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0] ?? node;
      first.focus();
    };
    const t = window.setTimeout(moveFocus, 0);

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap. When Tab would escape the modal, wrap to the
      // opposite end. Shift+Tab on the first element wraps to last;
      // Tab on the last wraps to first.
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      // Restore focus to the opener. Skip if that node is no longer
      // in the document (e.g. the page navigated while the modal was
      // open — restoring would throw).
      const prev = previouslyFocusedRef.current;
      if (prev && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Render through a portal anchored to <body>. Without this, any
  // ancestor with `transform`, `filter`, or `backdrop-filter` (e.g. the
  // sticky `backdrop-blur` filter bar on /auctions) becomes the
  // containing block for our `fixed inset-0` overlay — the modal then
  // anchors to that ancestor's top instead of the viewport, which read
  // to users as "messed up, stuck at the top, not centered."
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Content */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden focus:outline-none",
          mobileSheet
            ? "rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-md)]"
            : "rounded-[var(--radius-md)] mx-4",
          sizeMap[size],
          "max-h-[92vh] flex flex-col",
        )}
      >
        {/* Mobile drag handle */}
        {mobileSheet && (
          <div className="md:hidden flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
          </div>
        )}

        {/* Header */}
        {(title || description) && (
          <div className="px-5 pt-4 pb-3 border-b border-[var(--border)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && <h3 className="font-bold text-lg leading-tight">{title}</h3>}
                {description && (
                  <p className="text-sm text-[var(--foreground-muted)] mt-1">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 h-8 w-8 -mt-1 rounded-full hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center"
                aria-label={tCommon("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}
export function ModalFooter({ children, className }: ModalFooterProps) {
  // When the parent Modal renders as a mobile bottom-sheet, the footer
  // sits flush with the bottom of the viewport on iOS — the system home
  // indicator overlaps the buttons unless we add the safe-area inset.
  // `env(safe-area-inset-bottom)` is 0 on non-notched devices and on
  // desktop, so it costs nothing where it isn't needed.
  return (
    <div
      className={cn(
        "px-5 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex flex-col-reverse sm:flex-row gap-2 sm:justify-end",
        "pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
