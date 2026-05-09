import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  steps: { label: string }[];
  current: number; // 0-based
  className?: string;
}

export function Stepper({ steps, current, className }: Props) {
  return (
    <ol className={cn("flex items-center w-full", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={i}
            className={cn(
              "flex items-center",
              i < steps.length - 1 && "flex-1",
            )}
          >
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                  done &&
                    "bg-[var(--gold)] border-[var(--gold)] text-black",
                  active &&
                    "border-[var(--gold)] text-[var(--gold)] bg-[var(--gold-faint)]",
                  !done &&
                    !active &&
                    "border-[var(--border)] text-[var(--foreground-muted)]",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold whitespace-nowrap",
                  active ? "text-[var(--gold)]" : "text-[var(--foreground-muted)]",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 sm:mx-5 -mt-4 transition-colors",
                  done ? "bg-[var(--gold)]" : "bg-[var(--border)]",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
