"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
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
  X,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { NativeCapture } from "@/components/auction/NativeCapture";
import { thumb } from "@/lib/imageUrl";
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
  const { draft, update } = useDraft();
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";

  // Derive `photos` directly from the draft so there's a SINGLE source
  // of truth (localStorage). Previously this lived in a separate
  // useState + a `seededRef` guard that tried to hydrate-once from the
  // draft — but under certain mount timings (back-nav from /review,
  // React 19 strict-mode double-effects) the guard fired before the
  // draft hydrated, then refused to re-seed, leaving the user staring
  // at 12 empty slots even though all their photos were sitting in
  // localStorage. Deriving directly bypasses that race entirely.
  const photos: (string | null)[] = useMemo(() => {
    const saved = draft.imageUrls ?? [];
    const next: (string | null)[] = Array(12).fill(null);
    for (let i = 0; i < Math.min(12, saved.length); i++) {
      next[i] = saved[i] && saved[i].length > 0 ? saved[i] : null;
    }
    return next;
  }, [draft.imageUrls]);

  const filled = photos.filter(Boolean).length;
  const allDone = filled === 12;

  /** Write the i-th slot. Reads the latest draft, patches one slot,
   *  writes back. Pure draft mutation — no local state to keep in sync. */
  function setSlot(i: number, url: string) {
    const next: string[] = Array(12).fill("");
    for (let j = 0; j < 12; j++) {
      next[j] = photos[j] ?? "";
    }
    next[i] = url;
    update({ imageUrls: next });
  }

  /** Clear a slot — lets the user replace a bad photo without having
   *  to overwrite-then-retake. Was previously implicit (re-tap reopened
   *  the camera) but on review back-nav the user couldn't get rid of
   *  a photo without uploading a new one over it. */
  function clearSlot(i: number) {
    const next: string[] = Array(12).fill("");
    for (let j = 0; j < 12; j++) {
      next[j] = photos[j] ?? "";
    }
    next[i] = "";
    update({ imageUrls: next });
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
                    onClear={() => clearSlot(i)}
                  />
                )}
              </NativeCapture>
            );
          })}
        </div>

        <div className="pt-4 lg:pt-6 lg:border-t lg:border-[var(--border)] flex flex-col-reverse sm:flex-row gap-2 lg:gap-3 lg:justify-end">
          {/* Back-to-review escape hatch — only when ?from=review.
              Skips the otherwise mandatory walk-through-every-step. */}
          {fromReview ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => router.push("/seller/new/review")}
              className="lg:!w-auto lg:px-6"
            >
              <Undo2 className="h-4 w-4" />
              {tCommon("backToReview") ?? "Retour à la révision"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              onClick={() => router.back()}
              className="lg:!w-auto lg:px-6"
            >
              {tCommon("back")}
            </Button>
          )}
          <Button
            size="lg"
            fullWidth
            disabled={!allDone}
            onClick={() =>
              router.push(
                fromReview ? "/seller/new/review" : "/seller/new/step-3",
              )
            }
            className="lg:!w-auto lg:px-8"
          >
            {fromReview
              ? (tCommon("saveAndReturn") ?? "Enregistrer et revenir")
              : tCommon("continue")}
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
  onClear,
}: {
  index: number;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  photo: string | null;
  uploading: boolean;
  onTap: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors",
        uploading
          ? "border-[var(--gold)]"
          : photo
            ? "border-[var(--success)]"
            : "border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)]",
      )}
    >
      <button
        type="button"
        onClick={onTap}
        disabled={uploading}
        aria-label={`${index + 1}/12 — ${label}${photo ? " ✓" : ""}`}
        className="absolute inset-0 w-full h-full"
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(photo, { width: 320, quality: 60 })}
              alt={label}
              width={160}
              height={120}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
            <div className="absolute top-1 left-1 lg:top-2 lg:left-2 h-5 w-5 lg:h-7 lg:w-7 rounded-full bg-[var(--success)] flex items-center justify-center">
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
      {/* Clear button — only when there's a photo. Floats above the
          tap-to-replace button so the user can delete a bad shot
          without first overwriting it. Stops propagation so the parent
          tile's onTap (camera opener) doesn't fire. */}
      {photo && !uploading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Supprimer la photo ${index + 1}`}
          className="absolute top-1 right-1 lg:top-2 lg:right-2 h-6 w-6 lg:h-7 lg:w-7 rounded-full bg-black/70 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-500 transition-colors z-10"
        >
          <X className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
