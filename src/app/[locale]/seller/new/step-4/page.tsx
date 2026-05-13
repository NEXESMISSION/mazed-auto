"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  Check,
  AlertTriangle,
  ArrowRight,
  Camera,
  RotateCcw,
  Loader2,
  Undo2,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDraft } from "@/lib/draft";
import { useAuth } from "@/lib/auth";
import { NativeCapture } from "@/components/auction/NativeCapture";
import { thumb } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

// Exception values per PLAN §11.3. The first five cover legitimate name
// mismatches; "other" is the catch-all and forces an admin review before
// the auction can be published. Labels resolve via wizard.exception.*.
const EXCEPTION_VALUES = [
  "company",
  "agent",
  "inheritance",
  "spouse",
  "recent_purchase",
  "other",
] as const;

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeName(a) === normalizeName(b);
}

export default function Step4Page() {
  const router = useRouter();
  const { draft, update } = useDraft();
  const { user } = useAuth();
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";

  // Carte grise photos read DIRECTLY from the draft (single source of
  // truth). The previous version stored these in local useState only,
  // so they vanished on every revisit — the user had to re-photograph
  // their document if they came back to this step via /review's
  // Modifier link. Persisting through update() means they survive
  // navigation, reload, even the 7-day TTL of the draft.
  const front = draft.cartegriseFrontUrl ?? null;
  const back = draft.cartegriseBackUrl ?? null;

  // Form fields — keep local state for input perf (typing into a
  // controlled input that writes to localStorage on every keystroke
  // is fine for our scale, but feels marginally smoother local). One
  // useEffect re-syncs from the draft whenever it changes; no
  // seededRef guard, so back-nav from /review fills the form again.
  const [ownerName, setOwnerName] = useState(draft.ownerName ?? "");
  const [plate, setPlate] = useState(draft.registration ?? "");
  const [vin, setVin] = useState(draft.vin ?? "");
  const [year, setYear] = useState(draft.year ? String(draft.year) : "");
  const [exception, setException] = useState(draft.ownershipException ?? "");

  // Reactively sync the form fields from the draft. Same pattern as
  // step-5's pricing sync — no seededRef guard, deps are narrow so user
  // typing never triggers a re-run (typing updates local state only,
  // draft fields don't change until commit() writes them).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (draft.ownerName !== undefined) setOwnerName(draft.ownerName);
    if (draft.registration !== undefined) setPlate(draft.registration);
    if (draft.vin !== undefined) setVin(draft.vin);
    if (draft.year !== undefined) setYear(String(draft.year));
    if (draft.ownershipException !== undefined)
      setException(draft.ownershipException);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    draft.ownerName,
    draft.registration,
    draft.vin,
    draft.year,
    draft.ownershipException,
  ]);

  const kycName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const matched = ownerName ? namesMatch(ownerName, kycName) : false;
  const requiresAdminReview = exception === "other";

  const bothCaptured = Boolean(front && back);
  const canContinue =
    bothCaptured &&
    ownerName.trim().length > 0 &&
    plate.trim().length > 0 &&
    (matched || Boolean(exception));

  function commit() {
    update({
      ownerName: ownerName.trim(),
      registration: plate.trim(),
      vin: vin.trim() || undefined,
      year: year ? Number(year) : undefined,
      ownershipException: matched ? "" : exception,
      requiresOwnershipReview: !matched && exception === "other",
    });
    router.push(fromReview ? "/seller/new/review" : "/seller/new/step-5");
  }

  return (
    <CreateAuctionShell current={3}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">{tWiz("step4.title")}</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {tWiz("step4.subtitle")}
          </p>
        </div>

        {/* Back-to-review banner — only when ?from=review (the user
            tapped Modifier on /review). Lets them bail out without
            walking through every subsequent step. */}
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

        <div className="grid grid-cols-2 gap-3">
          <NativeCapture
            kind="photo"
            facing="environment"
            folder="carte-grise"
            onCaptured={(url) => update({ cartegriseFrontUrl: url })}
          >
            {({ open, uploading }) => (
              <ScanSlot
                label={tWiz("step4.recto")}
                hint={tWiz("step4.tapToCapture")}
                retakeLabel={tWiz("step4.retakePhoto")}
                url={front}
                uploading={uploading}
                onTap={open}
                onClear={() => update({ cartegriseFrontUrl: undefined })}
              />
            )}
          </NativeCapture>

          <NativeCapture
            kind="photo"
            facing="environment"
            folder="carte-grise"
            onCaptured={(url) => update({ cartegriseBackUrl: url })}
          >
            {({ open, uploading }) => (
              <ScanSlot
                label={tWiz("step4.verso")}
                hint={tWiz("step4.tapToCapture")}
                retakeLabel={tWiz("step4.retakePhoto")}
                url={back}
                uploading={uploading}
                onTap={open}
                onClear={() => update({ cartegriseBackUrl: undefined })}
              />
            )}
          </NativeCapture>
        </div>

        {/* Manual entry once both photos exist. */}
        {bothCaptured && (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
            <div className="text-xs font-bold text-[var(--gold)]">
              {tWiz("step4.fillInfo")}
            </div>
            <Field label={tWiz("step4.ownerName")}>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={tWiz("step4.ownerNamePlaceholder")}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tWiz("field.registration")}>
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder={tWiz("step1.registrationPlaceholder")}
                />
              </Field>
              <Field label={tWiz("step4.vinOptional")}>
                <Input
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder={tWiz("step4.vinPlaceholder")}
                />
              </Field>
            </div>
            <Field label={tWiz("step4.yearOptional")}>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                placeholder={tWiz("step1.yearPlaceholder")}
                inputMode="numeric"
              />
            </Field>
          </div>
        )}

        {bothCaptured && ownerName && matched && (
          <div className="rounded-[var(--radius)] bg-green-500/10 border border-green-500/30 p-4 flex gap-3 items-start">
            <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-green-400">{tWiz("step4.locked")}</div>
              <div className="text-[var(--foreground-muted)] text-xs mt-0.5">
                {tWiz("step4.lockedDescription")}
              </div>
            </div>
          </div>
        )}
        {bothCaptured && ownerName && !matched && kycName && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-red-400">
                {tWiz("step4.unlocked")}
              </div>
              <div className="text-[var(--foreground-muted)] text-xs mt-0.5 leading-relaxed">
                {tWiz.rich("step4.unlockedDescription", {
                  ownerName: () => <b>{ownerName}</b>,
                  kycName: () => <b>{kycName}</b>,
                })}
              </div>
            </div>
          </div>
        )}

        {bothCaptured && ownerName && !matched && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
              {tWiz("step4.reasonLabel")}{" "}
              <span className="text-red-400">*</span>
            </label>
            <select
              value={exception}
              onChange={(e) => setException(e.target.value)}
              className="h-11 w-full px-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                {tWiz("step4.chooseReason")}
              </option>
              {EXCEPTION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tWiz(`exception.${v}`)}
                </option>
              ))}
            </select>
            {exception && exception !== "other" && (
              <div className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--foreground-muted)]">
                  {tWiz("step4.additionalDocsHint")}
                </div>
              </div>
            )}
            {requiresAdminReview && (
              <div className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--foreground-muted)]">
                  {tWiz("step4.adminReviewHint")}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.back()}
          >
            {tCommon("back")}
          </Button>
          <Button size="lg" fullWidth disabled={!canContinue} onClick={commit}>
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

function ScanSlot({
  label,
  hint,
  retakeLabel,
  url,
  uploading,
  onTap,
  onClear,
}: {
  label: string;
  hint: string;
  retakeLabel: string;
  url: string | null;
  uploading: boolean;
  onTap: () => void;
  onClear: () => void;
}) {
  if (url) {
    return (
      <div className="relative aspect-[4/3] rounded-[var(--radius)] border-2 border-[var(--success)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(url, { width: 800, quality: 70 })}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <div className="absolute top-1.5 end-1.5 h-6 w-6 rounded-full bg-[var(--success)] flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        </div>
        <button
          onClick={onClear}
          className="absolute bottom-1.5 end-1.5 h-7 px-2 rounded-full bg-black/70 backdrop-blur text-white text-[10px] font-semibold flex items-center gap-1 hover:bg-black/90"
        >
          <RotateCcw className="h-3 w-3" />
          {retakeLabel}
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onTap}
      disabled={uploading}
      className={cn(
        "relative aspect-[4/3] rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors",
        uploading
          ? "border-[var(--gold)]"
          : "border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)]",
      )}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Camera className="h-6 w-6 text-[var(--gold)]" />
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[10px] text-[var(--foreground-muted)]">{hint}</div>
      </div>
      {uploading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[var(--gold)] animate-spin" />
        </div>
      )}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[var(--foreground-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
