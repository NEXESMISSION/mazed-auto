import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--surface-2)] text-foreground border border-[var(--border)]",
        gold: "bg-[var(--gold-faint)] text-[var(--gold-bright)] border border-[var(--gold-soft)]",
        goldFilled: "bg-[var(--gold)] text-black",
        success:
          "bg-green-500/15 text-green-400 border border-green-500/30",
        warning:
          "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        danger: "bg-red-500/15 text-red-400 border border-red-500/30",
        info: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
        outline:
          "bg-transparent text-foreground border border-[var(--border-strong)]",
      },
      size: {
        sm: "h-5 px-2 text-[10px]",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
