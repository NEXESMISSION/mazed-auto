import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";

interface Props {
  eyebrow: string;
  title: string;
  /** Gold-gradient highlighted word/phrase appended after `title`. */
  accent?: string;
  subtitle?: string;
  /** Icon shown next to the eyebrow. */
  IconLeft?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  /** Override the eyebrow icon color (e.g. "#ff6b3a" for "Hot now"). Default
   *  uses currentColor (gold). */
  accentColor?: string;
  href: string;
  /** Optional count appended to the eyebrow as `· N`. */
  count?: number;
  /** "Voir tout" link copy override (e.g. "Voir les ventes"). */
  ctaLabel?: string;
}

/**
 * Magazine-style section header for the home page on lg+. Renders nothing
 * on mobile — each rail keeps its own compact mobile header (lg:hidden)
 * so the existing mobile chrome is untouched.
 */
export function DesktopRailHeader({
  eyebrow,
  title,
  accent,
  subtitle,
  IconLeft,
  accentColor,
  href,
  count,
  ctaLabel = "Voir tout",
}: Props) {
  return (
    <div className="hidden lg:block px-8 mb-6">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            {IconLeft && (
              <IconLeft
                className="h-3.5 w-3.5"
                {...(accentColor ? { style: { color: accentColor } } : {})}
              />
            )}
            {eyebrow}
            {typeof count === "number" && (
              <span className="text-[var(--foreground-muted)]">· {count}</span>
            )}
          </div>
          <h2 className="mt-1.5 text-3xl xl:text-4xl font-black tracking-tight">
            {title}
            {accent && (
              <>
                {" "}
                <span className="gradient-gold-text">{accent}</span>
              </>
            )}
          </h2>
          {subtitle && (
            <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
              {subtitle}
            </p>
          )}
        </div>

        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-[13px] font-bold transition-colors"
        >
          {ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-5 h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />
    </div>
  );
}
