import { Link } from "@/i18n/navigation";
import { HeaderIcons } from "./HeaderIcons";

interface Props {
  /** Page-specific eyebrow + title shown on the start side. */
  eyebrow?: string;
  title: string;
}

/**
 * Lightweight top header for "noTopBar" pages (browse, etc.). Mirrors the
 * home header's layout: brand/title cluster on the start, shared messages
 * + notifications cluster always on the end.
 */
export function BrowseHeader({ eyebrow, title }: Props) {
  return (
    <header className="px-4 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="h-11 w-11 shrink-0 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60 shadow-[var(--shadow-gold)]"
          aria-label="Accueil"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Mazed Auto"
            className="h-full w-full object-cover"
            draggable={false}
          />
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
        <HeaderIcons />
      </div>
    </header>
  );
}
