"use client";

import { useState } from "react";
import { Ban, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  initialActive: boolean;
}

export function AdminUserActions({ userId, initialActive }: Props) {
  const { toast } = useToast();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    if (busy) return;
    const next = !active;
    if (!next) {
      const ok = window.confirm(
        "Désactiver ce compte ? L'utilisateur ne pourra plus enchérir, vendre, ni se connecter tant qu'il n'est pas réactivé.",
      );
      if (!ok) return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_user_active", {
      p_user_id: userId,
      p_active: next,
    });
    setBusy(false);
    if (error) {
      toast("Échec : " + error.message, "error");
      return;
    }
    setActive(next);
    toast(next ? "Compte réactivé" : "Compte désactivé", next ? "success" : "warning");
  }

  return (
    <div className="flex flex-col gap-2 w-full md:w-auto">
      {/* Active state pill — shows current status, toggles on click */}
      <button
        type="button"
        onClick={toggleActive}
        disabled={busy}
        className={`inline-flex items-center justify-between gap-3 px-3 h-11 rounded-[var(--radius)] border transition-colors ${
          active
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
            : "bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/15"
        } disabled:opacity-50`}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          {active ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Ban className="h-4 w-4" />
          )}
          {active ? "Compte actif" : "Compte désactivé"}
        </span>
        <span
          className={`relative h-5 w-9 rounded-full transition-colors ${
            active ? "bg-emerald-500" : "bg-red-500/70"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              active ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      <Button
        variant="secondary"
        size="md"
        onClick={() => toast("Avertissement envoyé", "info")}
      >
        <AlertTriangle className="h-4 w-4" />
        Envoyer un avertissement
      </Button>
    </div>
  );
}
