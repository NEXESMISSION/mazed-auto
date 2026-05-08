"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  size?: "md" | "lg";
}

/**
 * Larger, higher-contrast checkbox. Native input is hidden under a styled box
 * with a gold fill + black tick when checked. Default md (h-5) is twice the
 * area of the previous h-4 native; lg (h-6) for top-level consents.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  ({ className, size = "md", checked, ...rest }, ref) => {
    const box = size === "lg" ? "h-6 w-6" : "h-5 w-5";
    const icon = size === "lg" ? "h-4 w-4" : "h-[14px] w-[14px]";
    return (
      <span className={cn("relative inline-flex shrink-0", box, className)}>
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          {...rest}
          className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-md border-2 border-[var(--border-strong)] bg-[var(--surface)] transition-colors checked:border-[var(--gold)] checked:bg-[var(--gold)] hover:border-[var(--gold-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Check
          className={cn(
            "pointer-events-none absolute inset-0 m-auto text-black opacity-0 peer-checked:opacity-100 transition-opacity",
            icon,
          )}
          strokeWidth={3.5}
          aria-hidden
        />
      </span>
    );
  },
);
Checkbox.displayName = "Checkbox";
