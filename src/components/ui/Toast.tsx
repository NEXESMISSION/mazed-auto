"use client";

import * as React from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertDialog, type AlertPayload } from "./AlertDialog";

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  /**
   * Anything the user should notice. success / info slide in as a small
   * notice; error / warning open the centred dialog instead — an error the
   * user can scroll away from, or that fades after four seconds, is an error
   * they never read.
   */
  toast: (message: string, variant?: ToastVariant) => void;
  /**
   * A problem with structure: a title, and optionally the list of fields that
   * caused it. Each field can carry `fieldId`, which turns its line into a
   * button that scrolls to the field and focuses it.
   */
  alert: (payload: AlertPayload) => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

// Used when the context is missing. Throwing instead cost far more than it
// caught: a `useToast()` in any component React happens to render outside the
// provider's subtree — which SSR does for a subtree it re-renders on its own,
// e.g. ShareButton on the auction detail page — takes down the SERVER render
// of that page ("Switched to client rendering because the server rendering
// errored: useToast must be used within ToastProvider"). The whole route then
// falls back to client rendering: no server HTML, a blank first paint, and
// nothing in the page for crawlers. A missing provider is a wiring mistake
// worth surfacing, but it is not worth a blank page — so we warn in dev and
// keep rendering. The user simply doesn't get that one toast.
const NOOP_TOAST: ToastContextType = { toast: () => {}, alert: () => {} };

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Toast] useToast() called outside ToastProvider — toasts from this component will be dropped.",
      );
    }
    return NOOP_TOAST;
  }
  return ctx;
}

let id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [alertPayload, setAlertPayload] = React.useState<AlertPayload | null>(null);

  const alert = React.useCallback((payload: AlertPayload) => {
    setAlertPayload(payload);
  }, []);

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = "info") => {
      // Every existing `toast(msg, "error")` call in the app — 40 files' worth
      // — becomes a centred dialog from here, with no change at the call site.
      if (variant === "error" || variant === "warning") {
        setAlertPayload({ title: message, variant });
        return;
      }
      const newId = ++id;
      setToasts((prev) => [...prev, { id: newId, message, variant }]);
      // Only acknowledgements reach this line now, and they need no dwell
      // time — the dialog handles anything the user has to act on.
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newId));
      }, 1800);
    },
    [],
  );

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  const value = React.useMemo(() => ({ toast, alert }), [toast, alert]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {alertPayload && (
        <AlertDialog payload={alertPayload} onClose={() => setAlertPayload(null)} />
      )}
      {/* Top-anchored stack — sits below the status bar with safe-area
          padding so notifications never collide with the bottom tab bar.
          aria-live so screen-reader users hear toasts; assertive because
          most are action results (errors/confirmations) the user is waiting
          on. role="status" keeps it a non-interrupting live region. */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="false"
        className="fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const variantStyles: Record<
  ToastVariant,
  { icon: React.ElementType; accent: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: "bg-emerald-400",
    iconColor: "text-emerald-400",
  },
  error: {
    icon: XCircle,
    accent: "bg-[var(--danger)]",
    iconColor: "text-[var(--danger)]",
  },
  warning: {
    icon: AlertTriangle,
    accent: "bg-amber-400",
    iconColor: "text-amber-400",
  },
  info: {
    icon: Info,
    accent: "bg-[var(--gold)]",
    iconColor: "text-[var(--gold)]",
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { icon: Icon, accent, iconColor } = variantStyles[toast.variant];
  return (
    <div
      className={cn(
        "pointer-events-auto w-full max-w-[var(--max-w)]",
        "relative overflow-hidden rounded-2xl",
        "bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)]",
        "shadow-[0_12px_32px_rgba(0,0,0,0.6)]",
        "px-4 py-3 flex items-center gap-3",
        "animate-fade-in",
      )}
    >
      <span className={cn("absolute inset-y-0 start-0 w-1", accent)} />
      <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
      <div className="flex-1 text-sm text-foreground leading-snug">
        {toast.message}
      </div>
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="tap-target shrink-0 rounded-full flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-2)] hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
