import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { HeaderIcons } from "./HeaderIcons";

interface Props {
  /** Page-specific eyebrow + title shown on the start side. */
  eyebrow?: string;
  title: string;
  /** Optional action slot shown between the title and HeaderIcons —
   *  e.g. the /auctions view-mode toggle. */
  action?: ReactNode;
}

/**
 * Lightweight top header for "noTopBar" pages (browse, etc.). Mirrors the
 * home header's layout: back-to-home chevron on the start, brand title in
 * the middle, shared messages + notifications cluster on the end. Bottom-
 * tab pages aren't part of a navigation stack but users still expect a
 * way to "go back home" from any non-home tab — so the chevron is
 * unconditional here, even though there's no browser-history step to undo.
 */
export function BrowseHeader({ eyebrow, title, action }: Props) {
  return (
    <header className="px-4 pt-6">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Accueil"
          className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </Link>
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] truncate">
              {eyebrow}
            </div>
          )}
          <div className="font-extrabold text-[18px] tracking-tight truncate leading-tight">
            {title}
          </div>
        </div>
        {action}
        <HeaderIcons />
      </div>
    </header>
  );
}
