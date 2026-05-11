import { Gavel, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** `live` = green pulse, gold accents (active auctions group)
   *  `ended` = muted, no pulse (recently-sold group) */
  tone: "live" | "ended";
}

/**
 * Section banner that splits the home feed into clear groups —
 * "Enchères en direct" above (everything biddable) and "Récemment
 * vendues" below (social proof / history). Without these the rails
 * read as one long scroll of cars with no sense of state.
 *
 * Mobile: compact band with eyebrow + title only.
 * Desktop: full-width hairline + eyebrow + 3xl title + subtitle.
 */
export function HomeSectionDivider({ eyebrow, title, subtitle, tone }: Props) {
  const Icon = tone === "live" ? Gavel : Trophy;
  return (
    <section className="mt-10 lg:mt-16 px-4 lg:px-8" aria-label={title}>
      {/* Gradient hairline above */}
      <div
        className={cn(
          "h-px w-full",
          tone === "live"
            ? "bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
            : "bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent",
        )}
      />

      <div className="mt-5 lg:mt-7 flex items-center gap-3 lg:gap-4">
        <span
          className={cn(
            "h-10 w-10 lg:h-12 lg:w-12 rounded-2xl flex items-center justify-center shrink-0",
            tone === "live"
              ? "bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300"
              : "bg-[var(--surface-2)] ring-1 ring-[var(--border)] text-[var(--foreground-muted)]",
          )}
        >
          <Icon className="h-5 w-5 lg:h-5.5 lg:w-5.5" />
        </span>
        <div className="min-w-0">
          <div
            className={cn(
              "inline-flex items-center gap-2 text-[10px] lg:text-[11px] uppercase tracking-[0.22em] font-extrabold",
              tone === "live" ? "text-emerald-300" : "text-[var(--foreground-muted)]",
            )}
          >
            {tone === "live" && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            )}
            {eyebrow}
          </div>
          <h2 className="mt-0.5 lg:mt-1 text-xl lg:text-3xl xl:text-4xl font-black tracking-tight leading-tight">
            {title}
          </h2>
          <p className="hidden lg:block mt-1.5 text-sm text-[var(--foreground-muted)] max-w-2xl">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  );
}
