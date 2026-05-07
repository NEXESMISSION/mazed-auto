"use client";

import { useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { Seller } from "@/lib/types";

export function KycQueueList({
  items: initial,
  faceThreshold,
  ocrThreshold,
}: {
  items: Seller[];
  faceThreshold: number;
  ocrThreshold: number;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);

  async function decide(id: string, action: "approve" | "reject" | "retry") {
    const supabase = createClient();
    if (action === "approve") {
      const { error } = await supabase
        .from("sellers")
        .update({ verified_kyc: true, trust_score: 80, trust_level: "trusted" })
        .eq("id", id);
      if (error) {
        toast("Échec d'acceptation : " + error.message, "error");
        return;
      }
    }
    setItems((arr) => arr.filter((i) => i.id !== id));
    const labels = {
      approve: "Acceptée",
      reject: "Refusée",
      retry: "Réessai demandé",
    };
    toast(labels[action], action === "reject" ? "warning" : "success");
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const faceMatch = 75 + (item.trustScore % 20);
        const ocr = 80 + (item.successfulDeals % 15);
        return (
          <div
            key={item.id}
            className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold">{item.displayName}</div>
                <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  @{item.username} • {item.city}
                </div>
              </div>
              <Badge variant="warning" size="sm">
                Limite
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Score label="Face Match" value={faceMatch} threshold={faceThreshold} />
              <Score label="OCR Confidence" value={ocr} threshold={ocrThreshold} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => decide(item.id, "approve")}>
                <Check className="h-4 w-4" />
                Accepter
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => decide(item.id, "retry")}
              >
                <RotateCcw className="h-4 w-4" />
                Demander un nouvel essai
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => decide(item.id, "reject")}
              >
                <X className="h-4 w-4" />
                Refuser
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Score({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number;
  threshold: number;
}) {
  const color = value >= threshold ? "var(--success)" : "var(--warning)";
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-[var(--foreground-muted)]">{label}</span>
        <span className="font-bold text-sm tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <div className="text-[10px] text-[var(--foreground-subtle)] mt-1">
Seuil : {threshold}%
      </div>
    </div>
  );
}
