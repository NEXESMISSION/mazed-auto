"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface Props {
  auctionId: string;
  size?: "sm" | "md" | "lg";
  variant?: "circle" | "ghost";
  className?: string;
}

const sizeMap = {
  sm: { btn: "h-8 w-8", icon: "h-3.5 w-3.5" },
  md: { btn: "h-10 w-10", icon: "h-4 w-4" },
  lg: { btn: "h-11 w-11", icon: "h-5 w-5" },
};

export function FavoriteButton({
  auctionId,
  size = "md",
  variant = "circle",
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loaded: authLoaded } = useAuth();
  const { toast } = useToast();
  // null = unknown (still checking), false = not favorited, true = favorited
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoaded) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(false); // signed-out is "not favorited"
      return;
    }
    // Cleanup flag — without this, navigating away mid-fetch fires
    // setActive() on an unmounted component, generating React's
    // "can't perform state update on an unmounted component" warning.
    let mounted = true;
    setActive(null);
    const supabase = createClient();
    supabase
      .from("watchlist")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("auction_id", auctionId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setActive(!!data);
      });
    return () => {
      mounted = false;
    };
  }, [user, auctionId, authLoaded]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast("Connectez-vous pour ajouter cette enchère aux favoris", "info");
      router.push(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    if (busy || active === null) return;
    setBusy(true);
    const supabase = createClient();
    if (active) {
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("auction_id", auctionId);
      if (error) {
        toast("Échec de la suppression", "error");
      } else {
        setActive(false);
        toast("Retiré des favoris", "info");
      }
    } else {
      // Upsert with onConflict so a race (two rapid taps before our
      // local `active` flag flips) doesn't surface as a duplicate-key
      // error. The composite PK (user_id, auction_id) makes the second
      // call a no-op rather than an "Échec" toast.
      const { error } = await supabase
        .from("watchlist")
        .upsert(
          { user_id: user.id, auction_id: auctionId },
          { onConflict: "user_id,auction_id", ignoreDuplicates: true },
        );
      if (error) {
        toast("Échec de l'enregistrement", "error");
      } else {
        setActive(true);
        toast("Ajouté aux favoris", "success");
      }
    }
    setBusy(false);
  }

  const { btn, icon } = sizeMap[size];
  const baseClass =
    variant === "circle"
      ? "rounded-full bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--gold)]"
      : "rounded-[var(--radius)] hover:bg-[var(--surface-2)]";

  return (
    <button
      onClick={toggle}
      aria-label={
        active === null
          ? "Chargement"
          : active
            ? "Retirer des favoris"
            : "Ajouter aux favoris"
      }
      aria-pressed={active === true}
      aria-busy={active === null || busy}
      disabled={busy || active === null}
      className={cn(
        btn,
        baseClass,
        "flex items-center justify-center transition-colors",
        active === true && "text-[var(--gold)] border-[var(--gold)]",
        active === false &&
          "text-[var(--foreground-muted)] hover:text-[var(--gold)]",
        active === null && "opacity-50",
        className,
      )}
    >
      <Heart
        className={cn(icon, active === true && "fill-current")}
        // hide entirely while we don't know — prevents the empty→filled flash
        style={{ visibility: active === null ? "hidden" : "visible" }}
      />
    </button>
  );
}
