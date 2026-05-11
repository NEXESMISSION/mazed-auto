"use client";

import { useEffect, useRef, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { pickDepositFromTiers, type DepositTier } from "@/lib/deposit";

export default function Step5Page() {
  const { toast } = useToast();
  const router = useRouter();
  const { draft, hydrated, update } = useDraft();
  const [startingPrice, setStartingPrice] = useState(draft.startingPrice ?? 30000);
  const [reservePrice, setReservePrice] = useState(draft.reservePrice ?? 35000);
  const [buyNowPrice, setBuyNowPrice] = useState(draft.buyNowPrice ?? 45000);
  const [duration, setDuration] = useState<3 | 7 | 14>(
    (draft.durationDays as 3 | 7 | 14) ?? 7,
  );
  // Duration choices come from platform_settings so admins can offer
  // 5/10/20-day options without touching code. Falls back to 3/7/14.
  const [durationOpts, setDurationOpts] = useState<number[]>([3, 7, 14]);
  // Admin-tunable deposit tiers. Defaults match lib/config.ts; the DB
  // copy is the source of truth once the wizard publishes.
  const [depositTiers, setDepositTiers] = useState<DepositTier[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supa = createClient();
    Promise.all([
      supa
        .from("platform_settings")
        .select("value")
        .eq("key", "listing.duration_options")
        .maybeSingle(),
      supa
        .from("platform_settings")
        .select("value")
        .eq("key", "auction.deposit.tiers")
        .maybeSingle(),
    ]).then(([durRes, tierRes]) => {
      if (cancelled) return;
      const d = durRes.data?.value as unknown;
      if (Array.isArray(d) && d.every((x) => typeof x === "number")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDurationOpts(d as number[]);
      }
      const t = tierRes.data?.value as unknown;
      if (Array.isArray(t)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDepositTiers(t as DepositTier[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [hasReserve, setHasReserve] = useState(
    draft.reservePrice !== undefined ? Boolean(draft.reservePrice) : true,
  );
  const [hasBuyNow, setHasBuyNow] = useState(
    draft.buyNowPrice !== undefined ? Boolean(draft.buyNowPrice) : true,
  );

  // Local state is seeded from `draft` on first render, but `draft` is empty
  // until sessionStorage hydrates one tick later. On back-nav from /review
  // the user would otherwise see the defaults instead of their real values
  // — re-seed once we have the hydrated draft.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    seededRef.current = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (draft.startingPrice !== undefined) setStartingPrice(draft.startingPrice);
    if (draft.reservePrice !== undefined) setReservePrice(draft.reservePrice);
    if (draft.buyNowPrice !== undefined) setBuyNowPrice(draft.buyNowPrice);
    if (draft.durationDays !== undefined) setDuration(draft.durationDays);
    setHasReserve(draft.reservePrice !== undefined ? Boolean(draft.reservePrice) : true);
    setHasBuyNow(draft.buyNowPrice !== undefined ? Boolean(draft.buyNowPrice) : true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hydrated, draft.startingPrice, draft.reservePrice, draft.buyNowPrice, draft.durationDays]);

  // Tiered fixed-amount deposit — see lib/config.ts `pickDepositSync`.
  // Defaults (admin-overridable via platform_settings.auction.deposit.tiers):
  //   <20 000 DT  → 500 DT
  //   <100 000 DT → 1 000 DT
  //   otherwise   → 2 000 DT
  const deposit = pickDepositFromTiers(
    startingPrice,
    depositTiers ?? undefined,
  );
  // PLAN §21.5: 7% commission, capped at 15,000 DT per transaction.
  const commission = Math.min(
    Math.round((reservePrice || startingPrice) * 0.07),
    15000,
  );

  function next() {
    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      scrollToFirstInvalid(["startingPrice"]);
      toast("Le prix de départ doit être supérieur à 0", "warning");
      return;
    }
    if (hasReserve) {
      if (!Number.isFinite(reservePrice) || reservePrice <= startingPrice) {
        scrollToFirstInvalid(["reservePrice"]);
        toast("Le prix de réserve doit être supérieur au prix de départ", "warning");
        return;
      }
    }
    if (hasBuyNow) {
      const floor = hasReserve ? reservePrice : startingPrice;
      if (!Number.isFinite(buyNowPrice) || buyNowPrice <= floor) {
        scrollToFirstInvalid(["buyNowPrice"]);
        toast(
          hasReserve
            ? 'Le prix "Achat immédiat" doit être supérieur au prix de réserve'
            : 'Le prix "Achat immédiat" doit être supérieur au prix de départ',
          "warning",
        );
        return;
      }
      // Platform rule: buy-now must be at least 1.3× the starting
      // price (matches `auction.buy_now.min_multiplier` in
      // platform_settings, enforced server-side too). Catch it here
      // so the seller doesn't sit through the publish step only to
      // see the RPC reject — fail fast with a clear hint.
      const minBuyNow = startingPrice * 1.3;
      if (buyNowPrice < minBuyNow) {
        scrollToFirstInvalid(["buyNowPrice"]);
        toast(
          `"Achat immédiat" doit être ≥ 1,3× le prix de départ (min ${Math.ceil(minBuyNow)} DT)`,
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
      <div className="space-y-5 lg:space-y-8">
        <div>
          <div className="hidden lg:block text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            Étape 5 · Tarification
          </div>
          <h1 className="text-2xl lg:text-4xl font-extrabold lg:font-black lg:tracking-tight lg:mt-2">
            Prix et durée
          </h1>
          <p className="text-sm lg:text-base text-[var(--foreground-muted)] mt-1 lg:mt-3 lg:max-w-2xl">
            Définissez le prix de départ et la durée de l&apos;enchère. Les
            calculs de caution et commission s&apos;actualisent en temps réel.
          </p>
        </div>

        {/* Desktop: 2-col split — inputs on the start, live summary on the end */}
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 xl:gap-10 lg:items-start space-y-5 lg:space-y-0">
          {/* ── Inputs column ── */}
          <div className="space-y-5 lg:space-y-6 min-w-0">
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
                    La voiture n&apos;est vendue que si ce prix est atteint
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
              <div
                className="grid gap-2 lg:gap-3"
                style={{ gridTemplateColumns: `repeat(${durationOpts.length}, minmax(0, 1fr))` }}
              >
                {durationOpts.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d as 3 | 7 | 14)}
                    className={`h-12 lg:h-14 rounded-[var(--radius)] lg:rounded-2xl border-2 font-bold text-sm lg:text-base transition-colors ${
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
          </div>

          {/* ── Live summary column (sticky on desktop) ── */}
          <aside className="lg:sticky lg:top-[calc(4rem+1.5rem)] lg:self-start space-y-5 lg:space-y-4">
            <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] lg:bg-[var(--surface-2)]/40 border border-[var(--border)] overflow-hidden">
              <div className="px-4 lg:px-5 py-2.5 lg:py-4 bg-[var(--surface-2)] lg:bg-transparent lg:border-b lg:border-[var(--border)] border-b border-[var(--border)]">
                <div className="text-xs lg:text-[11px] uppercase lg:tracking-[0.22em] font-bold text-[var(--gold)]">
                  Résumé des chiffres
                </div>
                <div className="hidden lg:block mt-1 text-2xl font-black tabular-nums leading-none gradient-gold-text">
                  {formatPrice(startingPrice)}
                </div>
                <div className="hidden lg:block text-[11px] text-[var(--foreground-muted)] mt-0.5">
                  Prix de départ proposé
                </div>
              </div>
              <div className="p-4 lg:p-5 space-y-2 lg:space-y-3 text-sm">
                <Row label="Prix de départ" value={formatPrice(startingPrice)} />
                {hasReserve && (
                  <Row label="Prix de réserve" value={formatPrice(reservePrice)} />
                )}
                {hasBuyNow && (
                  <Row label='Prix "Achat immédiat"' value={formatPrice(buyNowPrice)} />
                )}
                <div className="border-t border-[var(--border)] my-2" />
                <Row
                  label="Caution par enchérisseur"
                  value={formatPrice(deposit)}
                  hint="Montant fixe — remboursée s'il ne gagne pas"
                />
                <Row
                  label="Commission Mazed (7%)"
                  value={formatPrice(commission)}
                  hint="Déduite du prix de vente final"
                />
              </div>
            </div>

            <div className="rounded-[var(--radius)] lg:rounded-2xl bg-[var(--gold-faint)] border border-[var(--gold-soft)]/30 p-3 lg:p-4 flex gap-2 lg:gap-3 items-start">
              <Info className="h-4 w-4 lg:h-4 lg:w-4 text-[var(--gold)] shrink-0 mt-0.5" />
              <div className="text-xs lg:text-[12px] text-[var(--foreground-muted)] leading-relaxed">
                <span className="font-semibold text-[var(--gold-bright)]">Anti-sniping :</span>{" "}
                Toute offre dans les 5 dernières minutes prolonge l&apos;enchère de 5 minutes pour garantir l&apos;équité.
              </div>
            </div>
          </aside>
        </div>

        <div className="pt-4 lg:pt-6 lg:border-t lg:border-[var(--border)] flex flex-col-reverse sm:flex-row gap-2 lg:gap-3 lg:justify-end">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.back()}
            className="lg:!w-auto lg:px-6"
          >
            Retour
          </Button>
          <Button
            size="lg"
            fullWidth
            onClick={next}
            className="lg:!w-auto lg:px-8"
          >
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
