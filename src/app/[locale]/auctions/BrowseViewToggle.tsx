"use client";

import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Sparkles } from "lucide-react";

/**
 * Compact two-state pill in the BrowseHeader that flips between the
 * modern filter-bar browse and the classic Marques + Catégories grid.
 * Lives as a URL param (`view=classic`) so the choice survives reloads
 * and is shareable. Defaults to modern.
 */
export function BrowseViewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const isClassic = params.get("view") === "classic";

  function setMode(next: "modern" | "classic") {
    const sp = new URLSearchParams(params.toString());
    if (next === "classic") sp.set("view", "classic");
    else sp.delete("view");
    const qs = sp.toString();
    router.push(qs ? `/auctions?${qs}` : "/auctions");
  }

  return (
    <div className="inline-flex h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 shrink-0">
      <button
        type="button"
        aria-label="Vue moderne"
        aria-pressed={!isClassic}
        onClick={() => setMode("modern")}
        className={`h-8 px-2.5 rounded-full inline-flex items-center gap-1 text-[11px] font-bold transition-colors ${
          !isClassic
            ? "bg-[var(--gold)] text-black"
            : "text-[var(--foreground-muted)] hover:text-foreground"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Moderne</span>
      </button>
      <button
        type="button"
        aria-label="Vue classique"
        aria-pressed={isClassic}
        onClick={() => setMode("classic")}
        className={`h-8 px-2.5 rounded-full inline-flex items-center gap-1 text-[11px] font-bold transition-colors ${
          isClassic
            ? "bg-[var(--gold)] text-black"
            : "text-[var(--foreground-muted)] hover:text-foreground"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Classique</span>
      </button>
    </div>
  );
}
