"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { invalidateBidAction } from "@/app/[locale]/admin/actions";
import { formatPrice } from "@/lib/format";
import { anonBidder } from "@/lib/anon";
import type { BidRow } from "@/lib/db";

interface Props {
  bids: BidRow[];
  auctionId: string;
}

export function AdminBidsList({ bids, auctionId: _auctionId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function invalidate(b: BidRow) {
    const reason = window.prompt(
      `Invalider l'offre de ${anonBidder(b.user_id, 0)} (${formatPrice(Number(b.amount))}) ?\nRaison (audit) :`,
      "",
    );
    if (!reason || !reason.trim()) return;
    setBusy(b.id);
    const r = await invalidateBidAction({
      bidId: b.id,
      reason: reason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Offre invalidée — prix recalculé", "warning");
    router.refresh();
  }

  if (bids.length === 0) {
    return (
      <p className="text-sm text-[var(--foreground-muted)] py-4 text-center">
        Aucune offre.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {bids.map((b, idx) => (
        <div
          key={b.id}
          className="grid grid-cols-[40px_1fr_auto_auto_auto] gap-3 items-center py-3 hover:bg-[var(--surface-2)] -mx-2 px-2 rounded transition-colors"
        >
          <div className="font-mono text-xs text-[var(--foreground-muted)] tabular-nums">
            #{bids.length - idx}
          </div>
          <div className="text-sm">
            {anonBidder(b.user_id, idx)}
            {b.is_auto_bid && (
              <Badge size="sm" variant="default" className="ms-2">
                AUTO
              </Badge>
            )}
          </div>
          <div className="font-bold tabular-nums text-[var(--gold)]">
            {formatPrice(Number(b.amount))}
          </div>
          <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
            {new Date(b.placed_at).toLocaleString("fr-FR")}
          </div>
          <button
            type="button"
            onClick={() => invalidate(b)}
            disabled={busy === b.id}
            title="Invalider l'offre (fraude)"
            className="h-7 w-7 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-red-500/40 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
