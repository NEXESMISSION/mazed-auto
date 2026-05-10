import { cn } from "@/lib/utils";

interface Props {
  steps: { label: string }[];
  current: number; // 0-based
  className?: string;
}

/**
 * Stories-style segmented progress bar with the active step label and a
 * "X / Y" counter underneath. Replaces the older 4-circle layout, which
 * crowded the header and forced labels to compete with the page title
 * on a 480px-wide phone container.
 *
 * Design choices:
 * - Each step is a thin pill (h-1, ~4px) — done segments are solid gold,
 *   the active one is gold with a soft glow, pending ones are muted.
 * - Only the active step's label is shown to keep the bar quiet; users
 *   navigate sequentially and the back button surfaces the previous one.
 * - Counter sits on the end so the user always knows how far they are
 *   without counting nodes.
 */
export function Stepper({ steps, current, className }: Props) {
  const total = steps.length;
  const safe = Math.max(0, Math.min(current, total - 1));
  const currentLabel = steps[safe]?.label ?? "";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-1.5">
        {steps.map((_, i) => {
          const done = i < safe;
          const active = i === safe;
          return (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                done && "bg-[var(--gold)]",
                active && "bg-[var(--gold)] shadow-[0_0_10px_rgba(212,175,55,0.6)]",
                !done && !active && "bg-[var(--border)]",
              )}
            />
          );
        })}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="font-extrabold tracking-tight text-[var(--gold)] truncate">
          {currentLabel}
        </span>
        <span className="text-[var(--foreground-muted)] tabular-nums shrink-0">
          Étape {safe + 1} / {total}
        </span>
      </div>
    </div>
  );
}
