"use client";

import { useState } from "react";
import { Check, X, Edit, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

export function AuctionsQueueList({ initial }: { initial: Auction[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject" | "edit") {
    setBusy(id);
    const supabase = createClient();

    if (action === "approve") {
      // Approving means the auction goes live now: status `active`, clock starts.
      // Recompute end_time = now + (original_end_time − start_time) so the
      // duration the seller picked is honoured from the approval moment.
      const { data: row } = await supabase
        .from("auctions")
        .select("start_time, original_end_time")
        .eq("id", id)
        .maybeSingle();

      const now = new Date();
      let endTime = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      if (row?.start_time && row?.original_end_time) {
        const duration =
          new Date(row.original_end_time).getTime() -
          new Date(row.start_time).getTime();
        if (duration > 0) endTime = new Date(now.getTime() + duration);
      }

      const { error } = await supabase
        .from("auctions")
        .update({
          status: "active",
          start_time: now.toISOString(),
          end_time: endTime.toISOString(),
          original_end_time: endTime.toISOString(),
        })
        .eq("id", id);
      setBusy(null);
      if (error) {
        toast("Échec de la publication de l'enchère : " + error.message, "error");
        return;
      }
    } else if (action === "reject") {
      const { error } = await supabase
        .from("auctions")
        .update({ status: "cancelled" })
        .eq("id", id);
      setBusy(null);
      if (error) {
        toast("Échec du refus de l'enchère : " + error.message, "error");
        return;
      }
    } else {
      // 'edit' is a request for the seller to revise — leave status as-is
      // (they can edit while pending_review), just notify.
      setBusy(null);
      // TODO: send seller a notification with the requested edits.
    }

    setItems((arr) => arr.filter((a) => a.id !== id));
    const labels = {
      approve: "Enchère publiée",
      reject: "Enchère refusée",
      edit: "Modification demandée",
    };
    toast(labels[action], action === "reject" ? "warning" : "success");
  }

  return (
    <div className="space-y-3">
      {items.map((a) => (
        <div
          key={a.id}
          className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
        >
          <div className="p-4 flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.vehicle.imageUrls[0]}
              alt=""
              className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Par : {a.seller.displayName} • Trust {a.seller.trustScore}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div>
                  <span className="text-[var(--foreground-muted)]">
                    Prix de départ:
                  </span>{" "}
                  <span className="font-bold">
                    {formatPrice(a.startingPrice)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--foreground-muted)]">Durée:</span>{" "}
                  <span className="font-bold">7 jours</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  KYC
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  Propriété
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  12 photos
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  Vidéo
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  AI Pass
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] p-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost">
              <Eye className="h-4 w-4" />
              Aperçu
            </Button>
            <Button size="sm" onClick={() => decide(a.id, "approve")} disabled={busy === a.id}>
              <Check className="h-4 w-4" />
              Approuver et publier
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => decide(a.id, "edit")}
              disabled={busy === a.id}
            >
              <Edit className="h-4 w-4" />
              Demander modification
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => decide(a.id, "reject")}
              disabled={busy === a.id}
            >
              <X className="h-4 w-4" />
              Refuser
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
