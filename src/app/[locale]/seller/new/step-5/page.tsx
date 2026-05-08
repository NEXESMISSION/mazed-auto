"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, Info } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { NumberField } from "@/components/ui/NumberField";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatPrice } from "@/lib/format";
import { useDraft } from "@/lib/draft";
import { useToast } from "@/components/ui/Toast";
import { scrollToFirstInvalid } from "@/lib/validation";

export default function Step5Page() {
  const { toast } = useToast();
  const router = useRouter();
  const { draft, update } = useDraft();
  const [startingPrice, setStartingPrice] = useState(draft.startingPrice ?? 30000);
  const [reservePrice, setReservePrice] = useState(draft.reservePrice ?? 35000);
  const [buyNowPrice, setBuyNowPrice] = useState(draft.buyNowPrice ?? 45000);
  const [duration, setDuration] = useState<3 | 7 | 14>(
    (draft.durationDays as 3 | 7 | 14) ?? 7,
  );
  const [hasReserve, setHasReserve] = useState(
    draft.reservePrice !== undefined ? Boolean(draft.reservePrice) : true,
  );
  const [hasBuyNow, setHasBuyNow] = useState(
    draft.buyNowPrice !== undefined ? Boolean(draft.buyNowPrice) : true,
  );

  const deposit = Math.round(startingPrice * 0.05);
  // PLAN §21.5: 7% commission, capped at 15,000 DT per transaction.
  const commission = Math.min(
    Math.round((reservePrice || startingPrice) * 0.07),
    15000,
  );

  function next() {
    if (!startingPrice || startingPrice <= 0) {
      scrollToFirstInvalid(["startingPrice"]);
      toast("Le prix de départ doit être supérieur à 0", "warning");
      return;
    }
    if (hasReserve && reservePrice <= startingPrice) {
      scrollToFirstInvalid(["reservePrice"]);
      toast("Le prix de réserve doit être supérieur au prix de départ", "warning");
      return;
    }
    if (hasBuyNow) {
      const floor = hasReserve ? reservePrice : startingPrice;
      if (buyNowPrice <= floor) {
        scrollToFirstInvalid(["buyNowPrice"]);
        toast(
          hasReserve
            ? 'Le prix "Achat immédiat" doit être supérieur au prix de réserve'
            : 'Le prix "Achat immédiat" doit être supérieur au prix de départ',
          "warning",
        );
        return;
      }
    }
    update({
      startingPrice,
      reservePrice: hasReserve ? reservePrice : undefined,
      buyNowPrice: hasBuyNow ? buyNowPrice : undefined,
      durationDays: duration,
    });
    router.push("/seller/new/review");
  }

  return (
    <CreateAuctionShell current={4}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Prix et durée</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Définissez le prix de départ et la durée de l'enchère
          </p>
        </div>

        <Field label="Prix de départ" required name="startingPrice">
          <NumberField
            placeholder="30000"
            value={startingPrice}
            onChange={(n) => setStartingPrice(n ?? 0)}
          />
        </Field>

        <div data-field="reservePrice">
          <label className="flex items-center gap-2.5 cursor-pointer mb-2">
            <Checkbox
              checked={hasReserve}
              onChange={(e) => setHasReserve(e.target.checked)}
            />
            <span className="font-semibold text-sm">Prix de réserve</span>
          </label>
          {hasReserve && (
            <>
              <NumberField
                placeholder="35000"
                value={reservePrice}
                onChange={(n) => setReservePrice(n ?? 0)}
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                La voiture n'est vendue que si ce prix est atteint
              </p>
            </>
          )}
        </div>

        <div data-field="buyNowPrice">
          <label className="flex items-center gap-2.5 cursor-pointer mb-2">
            <Checkbox
              checked={hasBuyNow}
              onChange={(e) => setHasBuyNow(e.target.checked)}
            />
            <span className="font-semibold text-sm">Prix d&apos;achat immédiat</span>
          </label>
          {hasBuyNow && (
            <>
              <NumberField
                placeholder="45000"
                value={buyNowPrice}
                onChange={(n) => setBuyNowPrice(n ?? 0)}
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                L&apos;acheteur peut clôturer l&apos;enchère immédiatement à ce prix
              </p>
            </>
          )}
        </div>

        <Field label="Durée de l'enchère" required>
          <div className="grid grid-cols-3 gap-2">
            {[3, 7, 14].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d as 3 | 7 | 14)}
                className={`h-12 rounded-[var(--radius)] border-2 font-bold text-sm transition-colors ${
                  duration === d
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--gold-soft)]"
                }`}
              >
                {d} {d === 1 ? "jour" : "jours"}
              </button>
            ))}
          </div>
        </Field>

        {/* Summary */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--gold)]">
Résumé des chiffres
          </div>
          <div className="p-4 space-y-2 text-sm">
            <Row label="Prix de départ" value={formatPrice(startingPrice)} />
            {hasReserve && (
              <Row label="Prix de réserve" value={formatPrice(reservePrice)} />
            )}
            {hasBuyNow && (
              <Row label='Prix "Achat immédiat"' value={formatPrice(buyNowPrice)} />
            )}
            <div className="border-t border-[var(--border)] my-2" />
            <Row
              label="Caution par enchérisseur (5%)"
              value={formatPrice(deposit)}
              hint="Remboursée s'il ne gagne pas"
            />
            <Row
              label="Commission Mazed (7%)"
              value={formatPrice(commission)}
              hint="Déduite du prix de vente final"
            />
          </div>
        </div>

        <div className="rounded-[var(--radius)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/30 p-3 flex gap-2 items-start">
          <Info className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            <span className="font-semibold text-[var(--gold-bright)]">Anti-sniping :</span>{" "}
            Toute offre dans les 5 dernières minutes prolonge l'enchère de 5 minutes pour garantir l'équité.
          </div>
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
          <Button size="lg" fullWidth onClick={next}>
Vérification finale
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </CreateAuctionShell>
  );
}

function Field({
  label,
  required,
  name,
  children,
}: {
  label: string;
  required?: boolean;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={name}>
      <label className="text-xs font-semibold text-[var(--foreground-muted)]">
        {label} {required && <span className="text-[var(--danger)]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <div>
        <div className="text-[var(--foreground-muted)]">{label}</div>
        {hint && (
          <div className="text-[10px] text-[var(--foreground-subtle)]">{hint}</div>
        )}
      </div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
