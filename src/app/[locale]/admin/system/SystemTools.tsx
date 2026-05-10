"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

/**
 * One-click maintenance tools. Each button calls a SQL RPC; result is
 * surfaced via toast. Purposefully thin — the real safety net lives
 * in the RPCs (which check `is_admin()` before doing anything).
 */
export function SystemTools() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function callRpc(name: string, label: string) {
    if (!window.confirm(`Lancer "${label}" maintenant ?`)) return;
    setBusy(name);
    const supabase = createClient();
    const { error } = await supabase.rpc(name);
    setBusy(null);
    if (error) {
      toast(`Échec : ${error.message}`, "error");
      return;
    }
    toast(`✓ ${label} terminé`, "success");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <h2 className="text-base font-bold">Maintenance</h2>
      <p className="text-xs text-[var(--foreground-muted)]">
        Ces actions sont normalement automatisées via cron. Les boutons sont là
        pour les rejouer manuellement quand un admin a besoin d&apos;un coup de
        main (ex : enchère bloquée, sweep manqué).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            callRpc("end_expired_auctions", "Sweep des enchères expirées")
          }
          disabled={!!busy}
        >
          <RefreshCw className="h-4 w-4" />
          {busy === "end_expired_auctions"
            ? "Exécution..."
            : "Sweep enchères expirées"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.refresh()}
          disabled={!!busy}
        >
          <Wand2 className="h-4 w-4" />
          Rafraîchir compteurs
        </Button>
      </div>
    </div>
  );
}
