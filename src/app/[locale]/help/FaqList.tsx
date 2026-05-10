"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
      {items.map((f, i) => (
        <details
          key={i}
          open={open === i}
          onClick={(e) => {
            e.preventDefault();
            setOpen(open === i ? null : i);
          }}
          className="group"
        >
          <summary className="p-4 cursor-pointer flex items-center justify-between gap-3 list-none hover:bg-[var(--surface-2)]">
            <span className="font-semibold text-sm flex-1">{f.q}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--foreground-muted)] transition-transform",
                open === i && "rotate-180",
              )}
            />
          </summary>
          <div className="px-4 pb-4 text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-line">
            {f.a}
          </div>
        </details>
      ))}
    </div>
  );
}
