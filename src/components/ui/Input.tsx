import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeft, iconRight, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {iconLeft && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] pointer-events-none">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            // text-base = 16px keeps iOS Safari from auto-zooming on focus.
            "h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-foreground placeholder:text-[var(--foreground-subtle)] transition-colors focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 disabled:cursor-not-allowed disabled:opacity-50",
            iconLeft && "pl-11",
            iconRight && "pr-11",
            className,
          )}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] pointer-events-none">
            {iconRight}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
