"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Camera,
  Check,
  ArrowRight,
  Zap,
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
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CameraCapture } from "@/components/auction/CameraCapture";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { cn } from "@/lib/utils";

// Dev-only: a small set of realistic Unsplash car photos used to fill empty
// slots during testing. Tree-shaken out of production builds.
const DEV_PLACEHOLDERS = [
  "https://images.unsplash.com/photo-1493238792000-8113da705763?w=900&q=80",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=900&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=900&q=80",
  "https://images.unsplash.com/photo-1542362567-b07e54358753?w=900&q=80",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=900&q=80",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=900&q=80",
];
const IS_DEV = process.env.NODE_ENV !== "production";

const photoSlots: { label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
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

  // Hydrate from draft once
  useEffect(() => {
    const saved = draft.imageUrls;
    if (saved && saved.length === 12) setPhotos(saved as (string | null)[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.imageUrls?.length]);

  const filled = photos.filter(Boolean).length;
  const allDone = filled === 12;

  function openCamera(i: number) {
    setActiveSlot(i);
  }

  function onCaptured(url: string) {
    if (activeSlot === null) return;
    const next = [...photos];
    next[activeSlot] = url;
    setPhotos(next);
    update({ imageUrls: next.map((p) => p ?? "") });
    setActiveSlot(null);
    toast(`Photo ${activeSlot + 1}/12 ✓`, "success");
  }

  // Dev-only: fill any empty slots with stock photos so the wizard can be
  // walked end-to-end without taking real shots. Stripped from prod by the
  // IS_DEV gate.
  function fillForTesting() {
    if (!IS_DEV) return;
    const next = photos.map(
      (p, i) => p ?? DEV_PLACEHOLDERS[i % DEV_PLACEHOLDERS.length],
    );
    setPhotos(next);
    update({ imageUrls: next.map((p) => p ?? "") });
    toast("Photos remplies (mode test)", "info");
  }

  return (
    <CreateAuctionShell current={1}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">12 Photo obligatoire</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
Prise de vue en direct uniquement — garantie d'authenticité et de qualité
          </p>
        </div>

        {/* Progress */}
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              <span className={allDone ? "text-[var(--success)]" : "text-[var(--gold)]"}>
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
            return (
              <button
                key={i}
                onClick={() => openCamera(i)}
                className={cn(
                  "relative aspect-square rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors",
                  photo
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

        {IS_DEV && !allDone && (
          <button
            onClick={fillForTesting}
            className="w-full rounded-[var(--radius)] border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
Mode test : remplir les photos restantes ({12 - filled})
          </button>
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
            // In dev we bypass the 12-photo gate entirely — click goes through
            // and auto-fills any empty slot with a stock photo first so the
            // saved draft has 12 valid URLs.
            disabled={!IS_DEV && !allDone}
            onClick={() => {
              if (IS_DEV && !allDone) {
                const next = photos.map(
                  (p, i) => p ?? DEV_PLACEHOLDERS[i % DEV_PLACEHOLDERS.length],
                );
                setPhotos(next);
                update({ imageUrls: next.map((p) => p ?? "") });
              }
              router.push("/seller/new/step-3");
            }}
          >
            Continuer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Camera modal */}
      <Modal
        open={activeSlot !== null}
        onClose={() => setActiveSlot(null)}
        title={
          activeSlot !== null
            ? `${activeSlot + 1}. ${photoSlots[activeSlot].label}`
            : ""
        }
      >
        <CameraCapture
          frame="vehicle"
          hint={
            activeSlot !== null
              ? `${photoSlots[activeSlot].label} — placez la voiture au centre du cadre, bon éclairage`
              : ""
          }
          onCapture={onCaptured}
          upload
          folder="auctions"
        />
      </Modal>
    </CreateAuctionShell>
  );
}
