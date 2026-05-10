"use client";

import { useState } from "react";
import { Check, X, ImageIcon, Video as VideoIcon, Layers, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { bulkReviewKycAction } from "@/app/[locale]/admin/actions";

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_RE.test(url);
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function bulk(decision: "approved" | "rejected") {
    if (selected.size === 0) return;
    let reason: string | null = null;
    if (decision === "rejected") {
      reason = window.prompt(
        `Motif de rejet en bloc (appliqué aux ${selected.size} dossiers) :`,
        "Documents insuffisants",
      );
      if (reason === null) return;
    } else {
      if (
        !window.confirm(
          `Approuver ${selected.size} dossiers KYC ? L'opération est consignée.`,
        )
      )
        return;
    }
    setBulkBusy(true);
    const r = await bulkReviewKycAction({
      submissionIds: Array.from(selected),
      decision,
      reason: reason?.trim() || null,
    });
    setBulkBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    const count = r.data?.count ?? 0;
    setItems((arr) => arr.filter((i) => !selected.has(i.id)));
    setSelected(new Set());
    toast(
      `${count} dossier${count > 1 ? "s" : ""} ${decision === "approved" ? "approuvé" : "refusé"}${count > 1 ? "s" : ""}`,
      decision === "approved" ? "success" : "warning",
    );
  }

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
      {items.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-[var(--gold)]"
          >
            {selected.size === items.length && items.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selected.size === 0
              ? "Tout sélectionner"
              : selected.size === items.length
                ? "Tout désélectionner"
                : `${selected.size}/${items.length} sélectionnés`}
          </button>
          {selected.size > 0 && (
            <>
              <Button
                size="sm"
                onClick={() => bulk("approved")}
                disabled={bulkBusy}
              >
                <Check className="h-4 w-4" />
                Approuver ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => bulk("rejected")}
                disabled={bulkBusy}
              >
                <X className="h-4 w-4" />
                Refuser ({selected.size})
              </Button>
            </>
          )}
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-[var(--radius-md)] bg-[var(--surface)] border ${
            selected.has(item.id)
              ? "border-[var(--gold)]"
              : "border-[var(--border)]"
          } p-4 space-y-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="shrink-0 mt-1 text-[var(--foreground-muted)] hover:text-[var(--gold)]"
                aria-label="Sélectionner"
              >
                {selected.has(item.id) ? (
                  <CheckSquare className="h-5 w-5 text-[var(--gold)]" />
                ) : (
                  <Square className="h-5 w-5" />
                )}
              </button>
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
            {/* `selfie_video_url` historically held a WebM clip; new
                submissions store a triptych JPEG (front | right | left
                composed side-by-side). Detect by extension so old
                video submissions still render as <video> and new
                ones as <img>. The triptych gets a wider 3:1 aspect
                with object-contain so all three poses stay visible. */}
            {item.selfie_video_url ? (
              isVideoUrl(item.selfie_video_url) ? (
                <DocCard
                  label="Selfie en direct"
                  url={item.selfie_video_url}
                  kind="video"
                />
              ) : (
                <DocCard
                  label="Selfie — 3 poses"
                  url={item.selfie_video_url}
                  kind="triptych"
                  className="sm:col-span-3"
                />
              )
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
            <b>Vérifiez :</b> les trois poses (face / droite / gauche) appartiennent
            bien à la même personne et au visage de la carte ; textes nets ;
            carte non expirée ; aucune retouche visible.
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
  className,
}: {
  label: string;
  url: string;
  kind: "image" | "video" | "triptych";
  className?: string;
}) {
  const Icon =
    kind === "video" ? VideoIcon : kind === "triptych" ? Layers : ImageIcon;
  // The triptych is 3:1 (front | right | left side-by-side). Letterboxed
  // via object-contain so all three poses stay fully visible — square /
  // cover would crop the side poses out.
  const aspect = kind === "triptych" ? "aspect-[3/1]" : "aspect-[4/3]";
  const fit = kind === "triptych" ? "object-contain" : "object-cover";
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground-muted)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`block ${aspect} rounded-[var(--radius)] border border-[var(--border)] overflow-hidden bg-black hover:border-[var(--gold)] transition-colors`}
      >
        {kind === "video" ? (
          <video
            src={url}
            controls
            playsInline
            className={`h-full w-full ${fit}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            loading="lazy"
            decoding="async"
            className={`h-full w-full ${fit}`}
          />
        )}
      </a>
    </div>
  );
}
