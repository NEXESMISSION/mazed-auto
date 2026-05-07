"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";

interface Props {
  /** Page title — shown bold in the center. */
  title: string;
  /** Optional secondary line below the title. */
  subtitle?: string;
  /**
   * Href for the back arrow. Omit to use router.back() instead. Pass `null`
   * to hide the back arrow entirely (e.g. on root mobile screens).
   */
  backHref?: string | null;
  /** Optional trailing action element (icon button, link, etc.) */
  action?: React.ReactNode;
}

/**
 * Standard top affordance for secondary mobile screens — back arrow on the
 * leading edge, title in the middle, optional action trailing. Used in place
 * of the global TopBar on pages that opt out of it.
 */
export function ScreenHeader({ title, subtitle, backHref, action }: Props) {
  const router = useRouter();
  const tCommon = useTranslations("common");

  return (
    <header className="px-4 pt-4 pb-3 flex items-center gap-3">
      {backHref === null ? (
        <span className="h-12 w-12 shrink-0" />
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label={tCommon("back")}
          className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </Link>
      ) : (
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-base truncate leading-tight">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
