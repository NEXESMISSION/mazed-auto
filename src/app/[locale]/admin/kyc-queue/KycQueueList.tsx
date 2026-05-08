"use client";

import { useState } from "react";
import { Check, X, ImageIcon, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

export interface KycSubmission {
  id: string;
  user_id: string;
  full_name: string | null;
  id_front_url: string;
  id_back_url: string;
  selfie_video_url: string | null;
  selfie_image_url: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  submitted_at: string;
}

export function KycQueueList({ items: initial }: { items: KycSubmission[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(
    submission: KycSubmission,
    decision: "approved" | "rejected",
    reason?: string,
  ) {
    if (busy) return;
    setBusy(submission.id);
    const supabase = createClient();
    // Single RPC that updates both kyc_submissions.status and the user's
    // user_metadata.kycStatus (keeps the user-facing UI in sync without a
    // service-role round-trip).
    const { error } = await supabase.rpc("review_kyc", {
      p_submission_id: submission.id,
      p_decision: decision,
      p_reason: reason ?? null,
    });
    setBusy(null);
    if (error) {
      toast("Échec : " + error.message, "error");
      return;
    }
    setItems((arr) => arr.filter((i) => i.id !== submission.id));
    toast(
      decision === "approved" ? "Dossier accepté" : "Dossier refusé",
      decision === "approved" ? "success" : "warning",
    );
  }

  function reject(submission: KycSubmission) {
    const reason = window.prompt(
      "Motif du refus (visible par l'utilisateur) :",
      "Documents flous ou illisibles",
    );
    if (reason === null) return;
    decide(submission, "rejected", reason.trim() || undefined);
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold">
                {item.full_name || "Nom non renseigné"}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5 font-mono">
                user: {item.user_id.slice(0, 8)}…
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)] mt-0.5">
                Soumis le{" "}
                {new Date(item.submitted_at).toLocaleString("fr-FR")}
              </div>
            </div>
            <Badge variant="warning" size="sm">
              En attente
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DocCard
              label="Carte — recto"
              url={item.id_front_url}
              kind="image"
            />
            <DocCard
              label="Carte — verso"
              url={item.id_back_url}
              kind="image"
            />
            {item.selfie_video_url ? (
              <DocCard
                label="Selfie en direct"
                url={item.selfie_video_url}
                kind="video"
              />
            ) : item.selfie_image_url ? (
              <DocCard
                label="Selfie"
                url={item.selfie_image_url}
                kind="image"
              />
            ) : (
              <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--foreground-muted)]">
                Pas de selfie
              </div>
            )}
          </div>

          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            <b>Vérifiez :</b> visage du selfie ≈ visage de la carte ; textes
            nets ; carte non expirée ; aucune retouche visible.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => decide(item, "approved")}
              disabled={busy === item.id}
            >
              <Check className="h-4 w-4" />
              Accepter
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => reject(item)}
              disabled={busy === item.id}
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

function DocCard({
  label,
  url,
  kind,
}: {
  label: string;
  url: string;
  kind: "image" | "video";
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground-muted)]">
        {kind === "image" ? (
          <ImageIcon className="h-3.5 w-3.5" />
        ) : (
          <VideoIcon className="h-3.5 w-3.5" />
        )}
        {label}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block aspect-[4/3] rounded-[var(--radius)] border border-[var(--border)] overflow-hidden bg-black hover:border-[var(--gold)] transition-colors"
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={url}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        )}
      </a>
    </div>
  );
}
