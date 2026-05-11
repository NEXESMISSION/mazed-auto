"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

// Slot key is the stable identifier; the visible label is resolved via
// useTranslations("wizard.photoSlot") at render time so AR/FR both work.
type PhotoSlotKey =
  | "front"
  | "rear"
  | "rightSide"
  | "leftSide"
  | "dashboard"
  | "odometer"
  | "frontSeats"
  | "rearSeats"
  | "engine"
  | "trunk"
  | "tires"
  | "vin";

const PHOTO_SLOTS: {
  key: PhotoSlotKey;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "front", Icon: Car },
  { key: "rear", Icon: Undo2 },
  { key: "rightSide", Icon: ArrowRightFromLine },
  { key: "leftSide", Icon: ArrowLeftFromLine },
  { key: "dashboard", Icon: LayoutGrid },
  { key: "odometer", Icon: Gauge },
  { key: "frontSeats", Icon: Armchair },
  { key: "rearSeats", Icon: Armchair },
  { key: "engine", Icon: Wrench },
  { key: "trunk", Icon: Package },
  { key: "tires", Icon: Disc3 },
  { key: "vin", Icon: Hash },
];

export default function Step2Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, hydrated, update } = useDraft();
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const [photos, setPhotos] = useState<(string | null)[]>(Array(12).fill(null));

  // Re-hydrate from the saved draft once. The earlier pattern depended
  // on `[draft.imageUrls?.length]` which doesn't fire when the draft
  // transitions from `{}` (initial sessionStorage miss) to an empty
  // array — leaving photos stuck at [null]*12 even when the user had
  // already captured some. Tying to `hydrated` is the same idiom we
  // already use in step-5. Audit finding #12.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    seededRef.current = true;
    const saved = draft.imageUrls;
    if (saved && saved.length > 0) {
      // Tolerate < 12 entries (legacy drafts) by padding with nulls.
      const next: (string | null)[] = Array(12).fill(null);
      for (let i = 0; i < Math.min(12, saved.length); i++) {
        next[i] = saved[i] && saved[i].length > 0 ? saved[i] : null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotos(next);
    }
  }, [hydrated, draft.imageUrls]);

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
      <div className="space-y-5 lg:space-y-8">
        <div>
          <div className="hidden lg:block text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            Étape 2 · Photos
          </div>
          <h1 className="text-2xl lg:text-4xl font-extrabold lg:font-black lg:tracking-tight lg:mt-2">
            {tWiz("step2.title")}
          </h1>
          <p className="text-sm lg:text-base text-[var(--foreground-muted)] mt-1 lg:mt-3 lg:max-w-2xl">
            {tWiz("step2.subtitle")}
          </p>
        </div>

        {/* Progress */}
        <div className="rounded-[var(--radius)] lg:rounded-2xl bg-[var(--surface)] lg:bg-[var(--surface-2)]/50 border border-[var(--border)] p-3 lg:p-5">
          <div className="flex items-center justify-between mb-2 lg:mb-3">
            <span className="text-sm lg:text-base font-semibold lg:font-bold">
              <span
                className={cn(
                  "tabular-nums lg:text-xl",
                  allDone ? "text-[var(--success)]" : "text-[var(--gold)]",
                )}
              >
                {filled}
              </span>{" "}
              <span className="text-[var(--foreground-muted)]">/ 12</span>
            </span>
            <span className="text-xs lg:text-sm text-[var(--foreground-muted)] font-semibold">
              {allDone
                ? tWiz("step2.done")
                : tWiz("step2.remaining", { count: 12 - filled })}
            </span>
          </div>
          <div className="h-1.5 lg:h-2 rounded-full bg-[var(--surface-2)] lg:bg-[var(--surface)] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                allDone ? "bg-[var(--success)]" : "bg-[var(--gold)]",
              )}
              style={{ width: `${(filled / 12) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-2.5 lg:gap-4">
          {PHOTO_SLOTS.map((slot, i) => {
            const label = tWiz(`photoSlot.${slot.key}`);
            return (
              <NativeCapture
                key={i}
                kind="photo"
                facing="environment"
                folder="auctions"
                onCaptured={(url) => {
                  setSlot(i, url);
                  toast(tWiz("step2.toastCaptured", { n: i + 1 }), "success");
                }}
              >
                {({ open, uploading }) => (
                  <SlotTile
                    index={i}
                    label={label}
                    Icon={slot.Icon}
                    photo={photos[i]}
                    uploading={uploading}
                    onTap={open}
                  />
                )}
              </NativeCapture>
            );
          })}
        </div>

        <div className="pt-4 lg:pt-6 lg:border-t lg:border-[var(--border)] flex flex-col-reverse sm:flex-row gap-2 lg:gap-3 lg:justify-end">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.back()}
            className="lg:!w-auto lg:px-6"
          >
            {tCommon("back")}
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={!allDone}
            onClick={() => router.push("/seller/new/step-3")}
            className="lg:!w-auto lg:px-8"
          >
            {tCommon("continue")}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </CreateAuctionShell>
  );
}

function SlotTile({
  index,
  label,
  Icon,
  photo,
  uploading,
  onTap,
}: {
  index: number;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  photo: string | null;
  uploading: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      disabled={uploading}
      aria-label={`${index + 1}/12 — ${label}${photo ? " ✓" : ""}`}
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
            alt={label}
            className="h-full w-full object-cover"
          />
          <div className="absolute top-1 right-1 lg:top-2 lg:right-2 h-5 w-5 lg:h-7 lg:w-7 rounded-full bg-[var(--success)] flex items-center justify-center">
            <Check className="h-3 w-3 lg:h-4 lg:w-4 text-white" strokeWidth={3} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-1.5 lg:p-3">
            <div className="text-[9px] lg:text-[12px] font-semibold lg:font-bold text-white text-center">
              {index + 1}. {label}
            </div>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 lg:p-3 text-center">
          <Icon className="h-6 w-6 lg:h-9 lg:w-9 text-[var(--gold)] mb-1 lg:mb-2" />
          <div className="text-[9px] lg:text-[13px] font-semibold lg:font-bold leading-tight">
            {index + 1}. {label}
          </div>
          <Camera className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-[var(--foreground-muted)] mt-1 lg:mt-2" />
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="h-6 w-6 lg:h-8 lg:w-8 text-[var(--gold)] animate-spin" />
        </div>
      )}
    </button>
  );
}
