import { Gavel, Trophy } from "lucide-react";

/**
 * Editorial section divider — gradient hairline → icon chip → eyebrow → bold
 * title. Ported from the mazed-auto home so the feed reads as grouped
 * "Enchères en direct" vs "Récemment adjugées" bands instead of a flat stack
 * of rails. `tone` switches the icon + accent (gold/live vs muted/sold).
 */
export function HomeSectionDivider({
  tone = "live",
  eyebrow,
  title,
  subtitle,
}: {
  tone?: "live" | "sold";
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  const isLive = tone === "live";
  const Icon = isLive ? Gavel : Trophy;
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        <span
          className={
            "inline-flex size-9 items-center justify-center rounded-full " +
            (isLive
              ? "batta-gold-fill shadow-[var(--shadow-gold)]"
              : "bg-surface-2 text-muted ring-1 ring-border")
          }
        >
          <Icon className="size-4" strokeWidth={2.2} />
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
      </div>
      <div className="mt-3 text-center">
        <span className={"batta-eyebrow " + (isLive ? "text-gold" : "")}>{eyebrow}</span>
        <h2 className="mt-1 text-[20px] font-extrabold leading-tight tracking-tight">
          {isLive ? <span className="gradient-gold-text">{title}</span> : title}
        </h2>
        {subtitle ? <p className="mx-auto mt-1 max-w-[34ch] text-[12px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
