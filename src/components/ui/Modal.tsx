"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  // Track when we're mounted on the client so the SSR pass can return
  // null (createPortal needs a real DOM target).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
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
        className={cn(
          "relative w-full bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden",
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
                aria-label="Fermer"
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
  return (
    <div
      className={cn(
        "px-5 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex flex-col-reverse sm:flex-row gap-2 sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}
