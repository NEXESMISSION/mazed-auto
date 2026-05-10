"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { HeaderIcons } from "./HeaderIcons";

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
  /** Optional trailing action element. When omitted the shared
   *  HeaderIcons cluster (messages + notification bell) is rendered, so
   *  every secondary screen gets the same trailing surface as the home
   *  / browse pages without each one wiring it manually. */
  action?: React.ReactNode;
}

/**
 * Standard top affordance for secondary mobile screens — back arrow on the
 * leading edge, title in the middle, message + notification cluster on the
 * trailing edge. Used in place of the global TopBar on pages that opt out
 * of it (most buyer/seller dashboards).
 */
export function ScreenHeader({ title, subtitle, backHref, action }: Props) {
  const router = useRouter();
  const tCommon = useTranslations("common");

  // Slim back button — matches the TopBar variant. The previous h-12
  // version made the header feel chunky and competed with the page title.
  const backCls =
    "h-9 w-9 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all";

  return (
    // Mobile-only — desktop chrome is owned by the global DesktopHeader.
    <header className="lg:hidden px-4 pt-4 pb-3 flex items-center gap-3">
      {backHref === null ? (
        <span className="h-9 w-9 shrink-0" />
      ) : backHref ? (
        <Link href={backHref} aria-label={tCommon("back")} className={backCls}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      ) : (
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className={backCls}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-base truncate leading-tight">
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      <div className="shrink-0">{action ?? <HeaderIcons />}</div>
    </header>
  );
}
