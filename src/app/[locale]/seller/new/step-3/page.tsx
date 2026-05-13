"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { ArrowRight, RotateCcw, Check, Undo2 } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { NativeCapture } from "@/components/auction/NativeCapture";

// PLAN §12 says the tour video runs ~60 seconds. Accept anything from
// 30 s (covers a fast checklist run) up to 90 s (small tolerance over the
// nominal cap) — reject runaway uploads earlier so the seller doesn't
// burn bandwidth on a clip the review queue will throw out anyway.
const MIN_VIDEO_S = 30;
const MAX_VIDEO_S = 90;

const CHECKLIST_KEYS = [
  { time: "0-20s", labelKey: "t1Label" as const },
  { time: "20-35s", labelKey: "t2Label" as const },
  { time: "35-45s", labelKey: "t3Label" as const },
  { time: "45-55s", labelKey: "t4Label" as const },
  { time: "55-60s", labelKey: "t5Label" as const },
];

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      cleanup();
      resolve(d);
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("video metadata read failed"));
    };
  });
}

export default function Step3Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  // When the user lands here from the /review "Modifier" link, we want
  // to give them a one-click escape back to /review instead of forcing
  // them through every subsequent step again. The Modifier link passes
  // ?from=review so we know.
  const fromReview = searchParams.get("from") === "review";

  // Single source of truth — read directly from the draft. Previously
  // this was useState(draft.videoUrl ?? null) which captured the value
  // on first render (before localStorage hydrated) and never re-synced.
  // Result: a video the user had already uploaded would appear gone
  // on every revisit. Same family of bug as step-2's lost photos.
  const videoUrl = draft.videoUrl ?? null;
  const done = Boolean(videoUrl);

  // Captured in the component so the rejection toast can use the active
  // locale's strings. NativeCapture calls this synchronously on each pick.
  async function validateVideo(
    file: File,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const duration = await readVideoDuration(file);
      if (!Number.isFinite(duration) || duration <= 0) {
        // Some Android encoders don't write a duration into the moov atom
        // until the file is fully muxed. Accept the upload rather than
        // blocking a seller on a metadata quirk; the review queue is the
        // final gate.
        return { ok: true };
      }
      if (duration < MIN_VIDEO_S) {
        return {
          ok: false,
          reason: tWiz("step3.tooShort", {
            seconds: Math.round(duration),
            min: MIN_VIDEO_S,
          }),
        };
      }
      if (duration > MAX_VIDEO_S) {
        return {
          ok: false,
          reason: tWiz("step3.tooLong", {
            max: MAX_VIDEO_S,
            seconds: Math.round(duration),
          }),
        };
      }
      return { ok: true };
    } catch {
      // Probe failed — let the upload proceed and rely on server-side review.
      return { ok: true };
    }
  }

  function handleCaptured(url: string) {
    update({ videoUrl: url });
    toast(tWiz("step3.uploadSuccess"), "success");
  }

  function reset() {
    update({ videoUrl: undefined });
  }

  return (
    <CreateAuctionShell current={2}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">{tWiz("step3.title")}</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {tWiz("step3.subtitle")}
          </p>
        </div>

        {/* Back-to-review banner — only visible when the user came from
            the review page via a Modifier link. Clicking goes straight
            back to /review with whatever they just changed, skipping the
            otherwise-mandatory walk through step-4, step-5 to get back. */}
        {fromReview && (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => router.push("/seller/new/review")}
          >
            <Undo2 className="h-4 w-4" />
            {tCommon("backToReview") ?? "Retour à la révision"}
          </Button>
        )}

        {done && videoUrl ? (
          <div className="relative aspect-[9/16] sm:aspect-video rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
            <video
              src={videoUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="absolute top-3 end-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <NativeCapture
            kind="video"
            facing="environment"
            folder="auction-video"
            label={tWiz("step3.captureLabel")}
            onCaptured={handleCaptured}
            validate={validateVideo}
          />
        )}

        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="text-xs font-bold text-[var(--gold)] mb-2">
            {tWiz("step3.contentHeading")}
          </div>
          <ul className="space-y-1.5">
            {CHECKLIST_KEYS.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-[var(--foreground-muted)] w-12 shrink-0">
                  {c.time}
                </span>
                <span className="text-foreground">
                  {tWiz(`step3.checklist.${c.labelKey}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {done && (
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" fullWidth onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              {tWiz("step3.retake")}
            </Button>
            <Button
              size="lg"
              fullWidth
              onClick={() =>
                router.push(
                  fromReview ? "/seller/new/review" : "/seller/new/step-4",
                )
              }
            >
              {fromReview
                ? (tCommon("saveAndReturn") ?? "Enregistrer et revenir")
                : tCommon("continue")}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </CreateAuctionShell>
  );
}
