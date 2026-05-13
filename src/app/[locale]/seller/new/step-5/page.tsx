"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Info, Star, Crown, ArrowUp, Undo2 } from "lucide-react";
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
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";
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

  // Paid boost add-ons + the per-plan discount of the signed-in user.
  // Fees come from platform_settings (auction.*_fee). The discount is
  // pulled from the user's active plan; 0 if the user has no plan.
  const [boostFeatured, setBoostFeatured] = useState(
    draft.boostFeatured ?? false,
  );
  const [boostVip, setBoostVip] = useState(draft.boostVip ?? false);
  const [boostTopOfSearch, setBoostTopOfSearch] = useState(
    draft.boostTopOfSearch ?? false,
  );
  const [boostFees, setBoostFees] = useState({
    featured: 50,
    vip: 200,
    topOfSearch: 30,
  });
  const [boostDiscountPct, setBoostDiscountPct] = useState(0);
  // Plan-bound max auction duration. -1/null = no plan cap (all
  // durationOpts allowed). Filtered against durationOpts before render.
  const [planMaxDuration, setPlanMaxDuration] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supa = createClient();
    Promise.all([
      supa
        .from("platform_settings")
        .select("key, value")
        .in("key", [
          "listing.duration_options",
          "auction.deposit.tiers",
          "auction.featured_listing_fee",
          "auction.vip_listing_fee",
          "auction.top_of_search_fee",
        ]),
      supa.auth.getUser(),
    ]).then(async ([settingsRes, userRes]) => {
      if (cancelled) return;
      const settingsRows = settingsRes.data ?? [];
      const byKey = new Map<string, unknown>(
        settingsRows.map((r) => [r.key as string, r.value as unknown]),
      );
      const dur = byKey.get("listing.duration_options");
      if (Array.isArray(dur) && dur.every((x) => typeof x === "number")) {
        setDurationOpts(dur as number[]);
      }
      const tiers = byKey.get("auction.deposit.tiers");
      if (Array.isArray(tiers)) {
        setDepositTiers(tiers as DepositTier[]);
      }
      const nFeatured = Number(byKey.get("auction.featured_listing_fee"));
      const nVip = Number(byKey.get("auction.vip_listing_fee"));
      const nTop = Number(byKey.get("auction.top_of_search_fee"));
      setBoostFees({
        featured: Number.isFinite(nFeatured) ? nFeatured : 50,
        vip: Number.isFinite(nVip) ? nVip : 200,
        topOfSearch: Number.isFinite(nTop) ? nTop : 30,
      });

      // Look up the user's active plan: applies the featured-listing
      // discount AND caps the duration picker. The view already filters
      // to active+cancelled-but-entitled rows.
      const uid = userRes.data?.user?.id;
      if (uid) {
        const { data: subRow } = await supa
          .from("user_active_subscription")
          .select("plan_slug, plan_name, max_listing_duration_days")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (subRow?.plan_slug) {
          const { data: planRow } = await supa
            .from("cms_subscription_plans")
            .select("featured_listing_discount_pct, max_listing_duration_days")
            .eq("slug", subRow.plan_slug)
            .maybeSingle();
          if (cancelled) return;
          const pct = Number(
            planRow?.featured_listing_discount_pct ?? 0,
          );
          setBoostDiscountPct(Number.isFinite(pct) ? pct : 0);
          const maxDays = Number(
            planRow?.max_listing_duration_days ??
              subRow.max_listing_duration_days ??
              0,
          );
          if (Number.isFinite(maxDays) && maxDays > 0) {
            setPlanMaxDuration(maxDays);
          }
          setPlanName((subRow.plan_name as string | null) ?? null);
        }
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

  // Reactive sync from the draft. NO seededRef guard here — that pattern
  // had a race: under React 19 strict-mode double-effects or back-nav
  // from /review, the effect could fire BEFORE the draft hydrated, then
  // refuse to re-seed when the real data arrived (leaving the user
  // staring at hardcoded defaults instead of their saved values). Same
  // family of bug as step-2's lost-photos issue.
  //
  // Removing the guard is safe because:
  //   • User input updates LOCAL state (setStartingPrice etc.), NOT the
  //     draft — so editing doesn't trigger this effect to re-fire and
  //     clobber what they just typed.
  //   • Draft fields only change when update() is explicitly called
  //     (on "Continue"), at which point the new value === local value,
  //     so the sync is a no-op.
  //   • Initial mount → effect runs with hydrated=false, bails. Then
  //     hydrated flips true with draft populated in the same batched
  //     render → effect re-runs and seeds. No more refusal.
  useEffect(() => {
    if (!hydrated) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (draft.startingPrice !== undefined) setStartingPrice(draft.startingPrice);
    if (draft.reservePrice !== undefined) setReservePrice(draft.reservePrice);
    if (draft.buyNowPrice !== undefined) setBuyNowPrice(draft.buyNowPrice);
    if (draft.durationDays !== undefined) setDuration(draft.durationDays);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hydrated, draft.startingPrice, draft.reservePrice, draft.buyNowPrice, draft.durationDays]);

  // Toggles get a SEPARATE one-shot seeding effect — they're derived
  // from the presence of reservePrice/buyNowPrice in the draft, not
  // stored in their own draft field, so we can't safely re-derive on
  // every change (the user might have toggled off while keeping the
  // price value cached). One-shot is fine here because toggles are
  // local UX state, not persisted business data — losing them on
  // back-nav is annoying but not "data lost".
  const togglesSeededRef = useRef(false);
  useEffect(() => {
    if (!hydrated || togglesSeededRef.current) return;
    togglesSeededRef.current = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setHasReserve(draft.reservePrice !== undefined ? Boolean(draft.reservePrice) : true);
    setHasBuyNow(draft.buyNowPrice !== undefined ? Boolean(draft.buyNowPrice) : true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hydrated, draft.reservePrice, draft.buyNowPrice]);

  // Apply the plan cap to the duration picker (if any).
  const effectiveDurationOpts =
    planMaxDuration !== null
      ? durationOpts.filter((d) => d <= planMaxDuration)
      : durationOpts;

  // If the user previously chose a duration that the new plan no longer
  // allows, clamp it to the highest still-allowed option.
  useEffect(() => {
    if (effectiveDurationOpts.length === 0) return;
    if (!effectiveDurationOpts.includes(duration)) {
      const fallback = effectiveDurationOpts[effectiveDurationOpts.length - 1];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDuration(fallback as 3 | 7 | 14);
    }
  }, [effectiveDurationOpts, duration]);

  // Tiered fixed-amount deposit — see lib/config.ts `pickDepositSync`.
  // Defaults (admin-overridable via platform_settings.auction.deposit.tiers):
  //   <20 000 DT  → 500 DT
  //   <100 000 DT → 1 000 DT
  //   otherwise   → 2 000 DT
  const deposit = pickDepositFromTiers(
    startingPrice,
    depositTiers ?? undefined,
  );
  // PLAN §21.5: 3% commission, capped at 15,000 DT per transaction.
  // Default rate; admins can override via platform_settings
  // `auction.commission.seller_pct`. The wizard uses the static
  // fallback to render the live preview; the server-side publish path
  // re-reads the DB value at insert time so the stored commission is
  // always authoritative.
  const commission = Math.min(
    Math.round((reservePrice || startingPrice) * 0.03),
    15000,
  );

  // Compute applied boost fee with the plan discount.
  const applyDiscount = (n: number) =>
    Math.max(0, Math.round(n * (1 - boostDiscountPct / 100)));
  const featuredFee = applyDiscount(boostFees.featured);
  const vipFee = applyDiscount(boostFees.vip);
  const topOfSearchFee = applyDiscount(boostFees.topOfSearch);
  const boostTotal =
    (boostFeatured ? featuredFee : 0) +
    (boostVip ? vipFee : 0) +
    (boostTopOfSearch ? topOfSearchFee : 0);

  function next() {
    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      scrollToFirstInvalid(["startingPrice"]);
      toast(tWiz("step5.toastBadStarting"), "warning");
      return;
    }
    if (hasReserve) {
      if (!Number.isFinite(reservePrice) || reservePrice <= startingPrice) {
        scrollToFirstInvalid(["reservePrice"]);
        toast(tWiz("step5.toastBadReserve"), "warning");
        return;
      }
    }
    if (hasBuyNow) {
      const floor = hasReserve ? reservePrice : startingPrice;
      if (!Number.isFinite(buyNowPrice) || buyNowPrice <= floor) {
        scrollToFirstInvalid(["buyNowPrice"]);
        toast(
          hasReserve
            ? tWiz("step5.toastBadBuyNowReserve")
            : tWiz("step5.toastBadBuyNowStarting"),
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
          tWiz("step5.toastBadBuyNowMin", { min: Math.ceil(minBuyNow) }),
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
      boostFeatured,
      boostVip,
      boostTopOfSearch,
    });
    router.push("/seller/new/review");
  }

  return (
    <CreateAuctionShell current={4}>
      <div className="space-y-5 lg:space-y-8">
        <div>
          <div className="hidden lg:block text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            {tWiz("step5.eyebrow")}
          </div>
          <h1 className="text-2xl lg:text-4xl font-extrabold lg:font-black lg:tracking-tight lg:mt-2">
            {tWiz("step5.title")}
          </h1>
          <p className="text-sm lg:text-base text-[var(--foreground-muted)] mt-1 lg:mt-3 lg:max-w-2xl">
            {tWiz("step5.subtitle")}
          </p>
        </div>

        {/* Desktop: 2-col split — inputs on the start, live summary on the end */}
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 xl:gap-10 lg:items-start space-y-5 lg:space-y-0">
          {/* ── Inputs column ── */}
          <div className="space-y-5 lg:space-y-6 min-w-0">
            <Field label={tWiz("step5.startingPrice")} required name="startingPrice">
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
                <span className="font-semibold text-sm">
                  {tWiz("step5.reservePrice")}
                </span>
              </label>
              {hasReserve && (
                <>
                  <NumberField
                    placeholder="35000"
                    value={reservePrice}
                    onChange={(n) => setReservePrice(n ?? 0)}
                  />
                  <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                    {tWiz("step5.reservePriceHint")}
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
                <span className="font-semibold text-sm">
                  {tWiz("step5.buyNowPrice")}
                </span>
              </label>
              {hasBuyNow && (
                <>
                  <NumberField
                    placeholder="45000"
                    value={buyNowPrice}
                    onChange={(n) => setBuyNowPrice(n ?? 0)}
                  />
                  <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                    {tWiz("step5.buyNowHint")}
                  </p>
                </>
              )}
            </div>

            <Field label={tWiz("step5.durationLabel")} required>
              <div
                className="grid gap-2 lg:gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, effectiveDurationOpts.length)}, minmax(0, 1fr))`,
                }}
              >
                {effectiveDurationOpts.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d as 3 | 7 | 14)}
                    className={`h-12 lg:h-14 rounded-[var(--radius)] lg:rounded-2xl border-2 font-bold text-sm lg:text-base transition-colors ${
                      duration === d
                        ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--gold-soft)]"
                    }`}
                  >
                    {d} {tWiz("step5.dayUnit", { count: d })}
                  </button>
                ))}
              </div>
              {planMaxDuration !== null &&
                effectiveDurationOpts.length < durationOpts.length && (
                  <p className="text-[11px] text-[var(--foreground-muted)] mt-1.5">
                    Votre plan{planName ? ` ${planName}` : ""} limite la durée
                    à {planMaxDuration} jours.
                  </p>
                )}
            </Field>

            {/* PAID BOOSTS (admin-managed fees, optional plan discount) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[var(--foreground-muted)]">
                  Visibilité supplémentaire (facultatif)
                </label>
                {boostDiscountPct > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.15em]">
                    <Star className="h-2.5 w-2.5" />
                    −{boostDiscountPct}% avec votre plan
                  </span>
                )}
              </div>
              <BoostRow
                checked={boostFeatured}
                onChange={setBoostFeatured}
                icon={<Star className="h-4 w-4" strokeWidth={2.5} />}
                title="En vedette"
                subtitle="Apparaît sur la page d'accueil pendant toute la durée"
                full={boostFees.featured}
                applied={featuredFee}
              />
              <BoostRow
                checked={boostVip}
                onChange={setBoostVip}
                icon={<Crown className="h-4 w-4" strokeWidth={2.5} />}
                title="VIP"
                subtitle="Push aux utilisateurs actifs + encadré premium"
                full={boostFees.vip}
                applied={vipFee}
              />
              <BoostRow
                checked={boostTopOfSearch}
                onChange={setBoostTopOfSearch}
                icon={<ArrowUp className="h-4 w-4" strokeWidth={2.5} />}
                title="Tête de recherche 24h"
                subtitle="Pinné en haut des résultats pendant 24h"
                full={boostFees.topOfSearch}
                applied={topOfSearchFee}
              />
            </div>
          </div>

          {/* ── Live summary column (sticky on desktop) ── */}
          <aside className="lg:sticky lg:top-[calc(4rem+1.5rem)] lg:self-start space-y-5 lg:space-y-4">
            <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] lg:bg-[var(--surface-2)]/40 border border-[var(--border)] overflow-hidden">
              <div className="px-4 lg:px-5 py-2.5 lg:py-4 bg-[var(--surface-2)] lg:bg-transparent lg:border-b lg:border-[var(--border)] border-b border-[var(--border)]">
                <div className="text-xs lg:text-[11px] uppercase lg:tracking-[0.22em] font-bold text-[var(--gold)]">
                  {tWiz("step5.summaryHeading")}
                </div>
                <div className="hidden lg:block mt-1 text-2xl font-black tabular-nums leading-none gradient-gold-text">
                  {formatPrice(startingPrice)}
                </div>
                <div className="hidden lg:block text-[11px] text-[var(--foreground-muted)] mt-0.5">
                  {tWiz("step5.summarySubtitle")}
                </div>
              </div>
              <div className="p-4 lg:p-5 space-y-2 lg:space-y-3 text-sm">
                <Row label={tWiz("step5.startingPrice")} value={formatPrice(startingPrice)} />
                {hasReserve && (
                  <Row label={tWiz("step5.reservePrice")} value={formatPrice(reservePrice)} />
                )}
                {hasBuyNow && (
                  <Row label={tWiz("step5.summaryBuyNow")} value={formatPrice(buyNowPrice)} />
                )}
                <div className="border-t border-[var(--border)] my-2" />
                <Row
                  label={tWiz("step5.summaryDeposit")}
                  value={formatPrice(deposit)}
                  hint={tWiz("step5.summaryDepositHint")}
                />
                <Row
                  label={tWiz("step5.summaryCommission")}
                  value={formatPrice(commission)}
                  hint={tWiz("step5.summaryCommissionHint")}
                />
                {boostTotal > 0 && (
                  <Row
                    label="Boosts payants"
                    value={formatPrice(boostTotal)}
                    hint={
                      boostDiscountPct > 0
                        ? `Inclut −${boostDiscountPct}% de remise plan`
                        : "Facturés au moment de la publication"
                    }
                  />
                )}
              </div>
            </div>

            <div className="rounded-[var(--radius)] lg:rounded-2xl bg-[var(--gold-faint)] border border-[var(--gold-soft)]/30 p-3 lg:p-4 flex gap-2 lg:gap-3 items-start">
              <Info className="h-4 w-4 lg:h-4 lg:w-4 text-[var(--gold)] shrink-0 mt-0.5" />
              <div className="text-xs lg:text-[12px] text-[var(--foreground-muted)] leading-relaxed">
                <span className="font-semibold text-[var(--gold-bright)]">
                  {tWiz("step5.antiSnipeLabel")}
                </span>{" "}
                {tWiz("step5.antiSnipeBody")}
              </div>
            </div>
          </aside>
        </div>

        <div className="pt-4 lg:pt-6 lg:border-t lg:border-[var(--border)] flex flex-col-reverse sm:flex-row gap-2 lg:gap-3 lg:justify-end">
          {/* When the user came here from /review (Modifier), the back
              button should bring them right back to /review — not the
              previous step. Standard browser-history back is too brittle
              (deep-linking, hard refresh). */}
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
            onClick={next}
            className="lg:!w-auto lg:px-8"
          >
            {fromReview
              ? (tCommon("saveAndReturn") ?? "Enregistrer et revenir")
              : tWiz("step5.finalReview")}
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

function BoostRow({
  checked,
  onChange,
  icon,
  title,
  subtitle,
  full,
  applied,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  full: number;
  applied: number;
}) {
  const hasDiscount = applied < full;
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`w-full text-start flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${
        checked
          ? "border-[var(--gold)] bg-[var(--gold-faint)] shadow-[var(--shadow-gold)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)]/40"
      }`}
    >
      <span
        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? "bg-[var(--gold)] text-black"
            : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
        }`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={`font-bold text-sm leading-tight ${
            checked ? "text-foreground" : ""
          }`}
        >
          {title}
        </div>
        <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5 leading-snug">
          {subtitle}
        </div>
      </div>
      <div className="text-end shrink-0 tabular-nums">
        {hasDiscount && (
          <div className="text-[10px] line-through text-[var(--foreground-subtle)] leading-none">
            {full} DT
          </div>
        )}
        <div
          className={`text-sm font-extrabold leading-tight ${
            checked ? "text-[var(--gold-bright)]" : "text-[var(--gold)]"
          }`}
        >
          {applied} DT
        </div>
      </div>
      <span
        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? "border-[var(--gold)] bg-[var(--gold)] text-black"
            : "border-[var(--border)] bg-transparent"
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="h-3 w-3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
    </button>
  );
}
