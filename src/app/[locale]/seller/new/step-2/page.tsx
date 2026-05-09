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
  Loader2,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { NativeCapture } from "@/components/auction/NativeCapture";
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

  function setSlot(i: number, url: string) {
    const next = [...photos];
    next[i] = url;
    setPhotos(next);
    update({ imageUrls: next.map((p) => p ?? "") });
  }

  return (
    <CreateAuctionShell current={1}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">12 photos obligatoires</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Touchez une vignette : la caméra de votre appareil s&apos;ouvre,
            vous prenez la photo puis vous validez dans l&apos;écran natif.
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
          {photoSlots.map((slot, i) => (
            <NativeCapture
              key={i}
              kind="photo"
              facing="environment"
              folder="auctions"
              onCaptured={(url) => {
                setSlot(i, url);
                toast(`Photo ${i + 1}/12 ✓`, "success");
              }}
            >
              {({ open, uploading }) => (
                <SlotTile
                  index={i}
                  slot={slot}
                  photo={photos[i]}
                  uploading={uploading}
                  onTap={open}
                />
              )}
            </NativeCapture>
          ))}
        </div>

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

function SlotTile({
  index,
  slot,
  photo,
  uploading,
  onTap,
}: {
  index: number;
  slot: { label: string; Icon: React.ComponentType<{ className?: string }> };
  photo: string | null;
  uploading: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      disabled={uploading}
      className={cn(
        "relative aspect-square rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors",
        uploading
          ? "border-[var(--gold)]"
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
              {index + 1}. {slot.label}
            </div>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 text-center">
          <slot.Icon className="h-6 w-6 text-[var(--gold)] mb-1" />
          <div className="text-[9px] font-semibold leading-tight">
            {index + 1}. {slot.label}
          </div>
          <Camera className="h-3.5 w-3.5 text-[var(--foreground-muted)] mt-1" />
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[var(--gold)] animate-spin" />
        </div>
      )}
    </button>
  );
}
