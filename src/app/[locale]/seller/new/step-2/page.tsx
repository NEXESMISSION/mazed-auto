"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Camera,
  Check,
  ArrowRight,
  Car,
  Undo2,
  ArrowRightFromLine,
  ArrowLeftFromLine,
  LayoutGrid,
  Gauge,
  Armchair,
  Wrench,
  Package,
  Disc3,
  Hash,
  RotateCcw,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { LivePhotoCapture } from "@/components/auction/LivePhotoCapture";
import { cn } from "@/lib/utils";

const photoSlots: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "Face avant", Icon: Car },
  { label: "Face arrière", Icon: Undo2 },
  { label: "Côté droit", Icon: ArrowRightFromLine },
  { label: "Côté gauche", Icon: ArrowLeftFromLine },
  { label: "Tableau de bord", Icon: LayoutGrid },
  { label: "Compteur", Icon: Gauge },
  { label: "Sièges avant", Icon: Armchair },
  { label: "Sièges arrière", Icon: Armchair },
  { label: "Moteur", Icon: Wrench },
  { label: "Coffre", Icon: Package },
  { label: "Pneus", Icon: Disc3 },
  { label: "VIN (Numéro de châssis)", Icon: Hash },
];

export default function Step2Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const [photos, setPhotos] = useState<(string | null)[]>(Array(12).fill(null));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  useEffect(() => {
    const saved = draft.imageUrls;
    if (saved && saved.length === 12) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotos(saved.map((u) => (u ? u : null)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.imageUrls?.length]);

  const filled = photos.filter(Boolean).length;
  const allDone = filled === 12;

  function persist(next: (string | null)[]) {
    setPhotos(next);
    update({ imageUrls: next.map((p) => p ?? "") });
  }

  return (
    <CreateAuctionShell current={1}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">12 photos obligatoires</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Prise de vue en direct uniquement — la caméra s&apos;ouvre
            directement, aucun fichier à téléverser.
          </p>
        </div>

        {/* Progress */}
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              <span
                className={
                  allDone ? "text-[var(--success)]" : "text-[var(--gold)]"
                }
              >
                {filled}
              </span>{" "}
              / 12
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">
              {allDone ? "Terminé ✓" : `${12 - filled} restantes`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                allDone ? "bg-[var(--success)]" : "bg-[var(--gold)]",
              )}
              style={{ width: `${(filled / 12) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {photoSlots.map((slot, i) => {
            const photo = photos[i];
            const isActive = activeSlot === i;
            return (
              <button
                key={i}
                onClick={() => setActiveSlot(isActive ? null : i)}
                className={cn(
                  "relative aspect-square rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors",
                  isActive
                    ? "border-[var(--gold)] bg-[var(--gold-faint)]"
                    : photo
                      ? "border-[var(--success)]"
                      : "border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)]",
                )}
              >
                {photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={slot.label}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-[var(--success)] flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-1.5">
                      <div className="text-[9px] font-semibold text-white text-center">
                        {i + 1}. {slot.label}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 text-center">
                    <slot.Icon className="h-6 w-6 text-[var(--gold)] mb-1" />
                    <div className="text-[9px] font-semibold leading-tight">
                      {i + 1}. {slot.label}
                    </div>
                    <Camera className="h-3.5 w-3.5 text-[var(--foreground-muted)] mt-1" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {activeSlot !== null && (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[var(--gold)]">
                Photo {activeSlot + 1}/12 — {photoSlots[activeSlot].label}
              </div>
              {photos[activeSlot] && (
                <button
                  onClick={() => {
                    const next = [...photos];
                    next[activeSlot] = null;
                    persist(next);
                  }}
                  className="text-[10px] text-[var(--foreground-muted)] flex items-center gap-1 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Refaire
                </button>
              )}
            </div>
            <LivePhotoCapture
              key={`slot-${activeSlot}-${photos[activeSlot] ? "done" : "fresh"}`}
              frame="vehicle"
              hint="Cadrez tout le sujet, sans flou"
              upload
              folder="auctions"
              facing="environment"
              onCapture={(url) => {
                const next = [...photos];
                next[activeSlot] = url;
                persist(next);
                toast(`Photo ${activeSlot + 1}/12 ✓`, "success");
                // Auto-advance to the next empty slot — keeps the flow moving
                // for the seller without forcing them to tap each tile.
                const nextEmpty = next.findIndex((p) => !p);
                setActiveSlot(nextEmpty === -1 ? null : nextEmpty);
              }}
            />
          </div>
        )}

        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.back()}
          >
            Retour
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={!allDone}
            onClick={() => router.push("/seller/new/step-3")}
          >
            Continuer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </CreateAuctionShell>
  );
}
