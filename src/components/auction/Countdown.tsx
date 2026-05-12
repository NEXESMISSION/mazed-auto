"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeRemaining } from "@/lib/format";

interface Props {
  endTime: Date | string | number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** kept for compatibility; ignored in inline-text design */
  showLabels?: boolean;
  /** show a leading clock icon */
  withIcon?: boolean;
}

const sizeStyles: Record<
  NonNullable<Props["size"]>,
  { text: string; icon: string; gap: string }
> = {
  sm: { text: "text-xs", icon: "h-3 w-3", gap: "gap-1" },
  md: { text: "text-sm", icon: "h-3.5 w-3.5", gap: "gap-1.5" },
  lg: { text: "text-lg md:text-xl", icon: "h-4 w-4", gap: "gap-1.5" },
  xl: { text: "text-2xl md:text-3xl", icon: "h-5 w-5", gap: "gap-2" },
};

const ZERO = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  totalMs: 0,
  isEnded: false,
};

/**
 * Inline live countdown text. Color escalates with urgency:
 *  - default (>1h):  brushed gold        — calm, on-brand
 *  - urgent (<1h):   warm amber          — high contrast on dark surfaces,
 *                                          unmissable but not error-coded
 *  - very urgent (<5m): bright amber + soft glow + pulse  — drama without
 *                                          using a destructive red
 *  - ended:          red-400 — final, unmistakable, no pink connotation
 */
export function Countdown({
  endTime,
  size = "md",
  className,
  withIcon = true,
}: Props) {
  const [time, setTime] = useState<typeof ZERO>(ZERO);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setTime(timeRemaining(endTime));
    const interval = setInterval(() => setTime(timeRemaining(endTime)), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const styles = sizeStyles[size];

  if (mounted && time.isEnded) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-bold",
          "text-red-400",
          styles.text,
          className,
        )}
      >
        {withIcon && <Clock className={styles.icon} />}
        Enchère terminée
      </span>
    );
  }

  const urgent = time.totalMs > 0 && time.totalMs < 60 * 60 * 1000;
  const veryUrgent = time.totalMs > 0 && time.totalMs < 5 * 60 * 1000;

  // Color tier — warm amber escalation. Avoids destructive red so the
  // countdown reads as "attention" not "error".
  const tierColor = veryUrgent
    ? "text-amber-200"
    : urgent
      ? "text-amber-300"
      : "text-[var(--gold-bright)]";

  // Soft glow only at the very-urgent tier; keeps the calm states quiet.
  const tierGlow = veryUrgent
    ? "[text-shadow:0_0_12px_rgba(251,191,36,0.55)]"
    : "";

  return (
    <span
      className={cn(
        "inline-flex items-center font-bold tabular-nums",
        styles.text,
        styles.gap,
        tierColor,
        tierGlow,
        veryUrgent && "animate-pulse",
        className,
      )}
      suppressHydrationWarning
    >
      {withIcon && <Clock className={styles.icon} />}
      {mounted ? formatRemaining(time) : "..."}
    </span>
  );
}

function formatRemaining(t: typeof ZERO): string {
  if (t.days > 0) return `${t.days}j ${pad(t.hours)}h ${pad(t.minutes)}m`;
  if (t.hours > 0) return `${t.hours}h ${pad(t.minutes)}m ${pad(t.seconds)}s`;
  if (t.minutes > 0) return `${t.minutes}m ${pad(t.seconds)}s`;
  return `${t.seconds}s`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
