"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Check, Edit2, Send, AlertTriangle } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LegalLink } from "@/components/legal/LegalLink";
import { useAuth } from "@/lib/auth";
import { useDraft, clearDraft } from "@/lib/draft";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatNumber } from "@/lib/format";
import { isInBlackout, type BlackoutWindow } from "@/lib/blackout";
import { pickDepositFromTiers, type DepositTier } from "@/lib/deposit";

// (Dev placeholder photos removed — every auction must use real photos
// captured live in step-2 / step-3.)

export default function ReviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { draft, hydrated } = useDraft();
  const t = useTranslations("wizard.review");
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const photoCount =
    draft.imageUrls?.filter((u) => u && u.length > 0).length ?? 0;

  async function publish() {
    if (!user) {
      toast(t("toastNeedLogin"), "warning");
      router.push("/login");
      return;
    }
    if (user.kycStatus !== "verified") {
      toast(t("toastNeedKyc"), "warning");
      router.push("/kyc/start");
      return;
    }
    setPublishing(true);
    setConfirmOpen(false);

    const supabase = createClient();

    // 1) Ensure a `sellers` row exists for this auth user
    const username =
      (user.email?.split("@")[0] || `seller_${user.id.slice(0, 6)}`).toLowerCase();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || username;

    const { error: sellerErr } = await supabase
      .from("sellers")
      .upsert(
        {
          id: user.id,
          username,
          display_name: displayName,
          city: draft.city || "Tunis",
          trust_score: user.trustScore || 50,
          trust_level: "trusted",
          verified_kyc: user.kycStatus === "verified",
          verified_ownership: true,
          account_age_months: 1,
        },
        { onConflict: "id" },
      );

    if (sellerErr) {
      setPublishing(false);
      toast(t("toastSellerFailed", { error: sellerErr.message }), "error");
      return;
    }

    // 2) Insert the auction row
    const startingPrice = draft.startingPrice ?? 0;

    const finalImages = (draft.imageUrls ?? []).filter(
      (u) => u && u.length > 0,
    );
    if (finalImages.length < 12) {
      setPublishing(false);
      toast(t("toastNeed12Photos"), "warning");
      router.push("/seller/new/step-2");
      return;
    }
    if (!draft.videoUrl) {
      setPublishing(false);
      toast(t("toastNeedVideo"), "warning");
      router.push("/seller/new/step-3");
      return;
    }

    const durationMs = (draft.durationDays ?? 7) * 24 * 3600 * 1000;
    const now = new Date();
    const endTime = new Date(now.getTime() + durationMs);

    // Blackout window enforcement — admins can mark hours of the day
    // (typically late night) as off-limits for auction closings so the
    // last 5 minutes don't run while nobody's awake to defend a bid.
    try {
      const { data: rows } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [
          "auction.blackout.enabled",
          "auction.blackout.windows",
          "auction.blackout.timezone",
        ]);
      const byKey = new Map(
        (rows ?? []).map((r) => [r.key, r.value as unknown]),
      );
      const enabled = byKey.get("auction.blackout.enabled") === true;
      if (enabled) {
        const windows = (byKey.get("auction.blackout.windows") ?? [[23, 7]]) as
          | BlackoutWindow[]
          | unknown;
        const timezone =
          (byKey.get("auction.blackout.timezone") as string | undefined) ??
          "Africa/Tunis";
        const safeWindows: BlackoutWindow[] = Array.isArray(windows)
          ? (windows as BlackoutWindow[]).filter(
              (w) =>
                Array.isArray(w) &&
                w.length === 2 &&
                w.every((n) => typeof n === "number"),
            )
          : [];
        if (isInBlackout(endTime, safeWindows, timezone)) {
          setPublishing(false);
          toast(t("toastBlackout"), "warning");
          return;
        }
      }
    } catch {
      // If the settings table is missing on a fresh checkout, fall
      // through to insert without blackout enforcement.
    }

    // Plan-quota enforcement — block publish if the user has run out of
    // listings for the current billing period. Personal users with no
    // active subscription fall back to the `listing.free_per_month`
    // setting (see migrate-pricing-spec.sql / RPC user_listings_remaining).
    try {
      const { data: remaining } = await supabase.rpc(
        "user_listings_remaining",
        { p_user_id: user.id },
      );
      if (typeof remaining === "number" && remaining <= 0) {
        setPublishing(false);
        toast(t("toastQuotaExceeded"), "warning");
        router.push("/pricing");
        return;
      }
    } catch {
      // Fresh checkout / missing RPC — let the publish through.
    }

    // Plan-bound max duration. If the user has an active plan, refuse
    // to publish an auction longer than the plan allows. Without an
    // active sub, no plan cap applies (the duration_options setting
    // already limits the chooser to admin-allowed values).
    try {
      const { data: subRow } = await supabase
        .from("user_active_subscription")
        .select("plan_slug")
        .eq("user_id", user.id)
        .maybeSingle();
      if (subRow?.plan_slug) {
        const { data: planRow } = await supabase
          .from("cms_subscription_plans")
          .select("max_listing_duration_days")
          .eq("slug", subRow.plan_slug)
          .maybeSingle();
        const maxDays = Number(planRow?.max_listing_duration_days ?? 30);
        if (
          Number.isFinite(maxDays) &&
          maxDays > 0 &&
          (draft.durationDays ?? 7) > maxDays
        ) {
          setPublishing(false);
          toast(t("toastPlanDuration", { maxDays }), "warning");
          return;
        }
      }
    } catch {
      // ignore on fresh checkout
    }

    // Bid-increment tiers live in platform_settings so the admin can
    // tune them without a redeploy. Falls back to the legacy 250/500/1000
    // ladder if the row is missing or malformed.
    let bidIncrement = 250;
    // Tiered fixed-amount entry deposit. Same admin-tunable pattern as
    // bid increments. Falls back to the spec defaults if the row is
    // missing on a fresh checkout.
    let participationDeposit = pickDepositFromTiers(startingPrice);
    try {
      const [{ data: incrRow }, { data: depRow }] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "listing.bid_increment_tiers")
          .maybeSingle(),
        supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "auction.deposit.tiers")
          .maybeSingle(),
      ]);

      const incrTiers = (incrRow?.value ?? []) as Array<{
        max: number | null;
        increment: number;
      }>;
      if (Array.isArray(incrTiers) && incrTiers.length > 0) {
        const match = incrTiers.find(
          (t) => t.max === null || startingPrice < t.max,
        );
        if (match && Number.isFinite(match.increment)) {
          bidIncrement = match.increment;
        }
      } else {
        bidIncrement =
          startingPrice >= 100000
            ? 1000
            : startingPrice >= 30000
              ? 500
              : 250;
      }

      const depTiers = depRow?.value as unknown;
      if (Array.isArray(depTiers) && depTiers.length > 0) {
        participationDeposit = pickDepositFromTiers(
          startingPrice,
          depTiers as DepositTier[],
        );
      }
    } catch {
      bidIncrement =
        startingPrice >= 100000 ? 1000 : startingPrice >= 30000 ? 500 : 250;
      // participationDeposit stays at the default from pickDepositFromTiers above.
    }

    // Boost fees are NOT charged here — the auction is still in
    // pending_review and may get rejected. The is_featured / is_vip
    // flags are persisted on the row; the admin's "Approuver et publier"
    // step in /admin/auctions-queue charges the corresponding ledger
    // rows when the auction actually goes live.

    const { data: auction, error: auctionErr } = await supabase
      .from("auctions")
      .insert({
        seller_id: user.id,
        make: draft.make,
        model: draft.model,
        year: draft.year,
        mileage: draft.mileage ?? 0,
        fuel_type: draft.fuelType,
        transmission: draft.transmission,
        color: draft.color,
        condition: draft.condition,
        category: draft.category,
        description: draft.description ?? null,
        features: draft.features ?? [],
        city: draft.city,
        region: draft.region,
        image_urls: finalImages,
        video_url: draft.videoUrl,
        starting_price: startingPrice,
        reserve_price: draft.reservePrice ?? null,
        buy_now_price: draft.buyNowPrice ?? null,
        current_price: startingPrice,
        participation_deposit: participationDeposit,
        bid_increment: bidIncrement,
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        original_end_time: endTime.toISOString(),
        // PLAN §22 — every new auction lands in the admin review queue.
        // An admin flips it to `active` from /admin/auctions-queue.
        status: "pending_review",
        reserve_met: false,
        // Paid visibility add-ons. is_featured is the canonical "appears on
        // home page" flag (the AdminAuctionControls toggle reads/writes
        // this), is_vip is the VIP-rail flag, top_of_search pins the
        // listing to the top of search results for 24h. All three are
        // set from the step-5 wizard toggles.
        is_featured: Boolean(draft.boostFeatured),
        is_vip: Boolean(draft.boostVip),
        top_of_search: Boolean(draft.boostTopOfSearch),
        // Golden-Lock metadata — captured here so /admin/ownership-review
        // can surface exceptional cases instead of letting them mix into
        // the regular queue with no signal. The carte grise photo URLs
        // give the admin the actual document to verify against the
        // owner name.
        ownership_exception: draft.ownershipException ?? null,
        carte_grise_owner_name: draft.ownerName ?? null,
        carte_grise_front_url: draft.cartegriseFrontUrl ?? null,
        carte_grise_back_url: draft.cartegriseBackUrl ?? null,
      })
      .select("id")
      .single();

    if (auctionErr) {
      setPublishing(false);
      // The atomic publish-quota trigger raises QUOTA_EXCEEDED if the
      // user blew through their plan limit between the optimistic
      // pre-check above and the insert (e.g. double-tap, two tabs).
      // Surface the dedicated copy so they know to upgrade instead of
      // staring at a raw SQL error.
      if (auctionErr.message?.includes("QUOTA_EXCEEDED")) {
        toast(t("toastQuotaExceeded"), "warning");
        router.push("/pricing");
        return;
      }
      toast(t("toastPublishFailed", { error: auctionErr.message }), "error");
      return;
    }

    setPublishing(false);
    clearDraft();
    toast(t("toastPublishSuccess"), "success");
    router.push(`/seller/auctions/${auction.id}`);
    router.refresh();
  }

  if (!hydrated) {
    return (
      <CreateAuctionShell current={4}>
        <div className="text-center py-12 text-[var(--foreground-muted)]">
          {t("loading")}
        </div>
      </CreateAuctionShell>
    );
  }

  // Validation
  const missing: string[] = [];
  if (!draft.make || !draft.model || !draft.year) missing.push(t("missingVehicle"));
  if (photoCount < 12) missing.push(t("missingPhotos", { count: photoCount }));
  if (!draft.videoUrl) missing.push(t("missingVideo"));
  if (!draft.startingPrice) missing.push(t("missingPrice"));

  const fuelLabel = draft.fuelType ? tWiz(`fuel.${draft.fuelType}`) : "—";
  const conditionLabel = draft.condition ? tWiz(`condition.${draft.condition}`) : "—";

  return (
    <CreateAuctionShell current={4}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {t("subtitle")}
          </p>
        </div>

        {missing.length > 0 && (
          <div className="rounded-[var(--radius)] p-3 flex gap-2 items-start bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <div className="text-xs leading-relaxed text-red-200">
              <div className="font-bold">{t("missingTitle")}</div>
              <div className="mt-0.5">{missing.join(" — ")}</div>
            </div>
          </div>
        )}

        {user && user.kycStatus !== "verified" && (
          <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/40 p-3 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed flex-1">
              <div className="font-bold text-amber-300">
                {t("kycWarningTitle")}
              </div>
              <div className="text-[var(--foreground-muted)] mt-0.5">
                {t("kycWarningBody")}
              </div>
            </div>
            <Link href="/kyc/start">
              <Button size="sm">{t("kycWarningCta")}</Button>
            </Link>
          </div>
        )}

        <Section
          title={t("sectionVehicle")}
          editLabel={t("edit")}
          editHref="/seller/new/step-1?from=review"
        >
          <Row
            k={t("rowMakeModel")}
            v={
              draft.make && draft.model && draft.year
                ? `${draft.make} ${draft.model} ${draft.year}`
                : "—"
            }
          />
          <Row
            k={t("rowMileage")}
            v={
              draft.mileage !== undefined
                ? `${formatNumber(draft.mileage)} km`
                : "—"
            }
          />
          <Row k={t("rowFuel")} v={fuelLabel} />
          <Row k={t("rowCondition")} v={conditionLabel} />
          <Row k={t("rowSite")} v={draft.city ?? "—"} />
        </Section>

        <Section
          title={t("sectionPhotos")}
          editLabel={t("edit")}
          editHref="/seller/new/step-2?from=review"
        >
          {photoCount === 12 ? (
            <div className="text-sm text-[var(--success)] flex items-center gap-2">
              <Check className="h-4 w-4" />
              {t("photosDone")}
            </div>
          ) : (
            <div className="text-sm text-[var(--warning)]">
              {t("photosMissing", { count: photoCount })}
            </div>
          )}
        </Section>

        <Section
          title={t("sectionVideo")}
          editLabel={t("edit")}
          editHref="/seller/new/step-3?from=review"
        >
          {draft.videoUrl ? (
            <div className="text-sm text-[var(--success)] flex items-center gap-2">
              <Check className="h-4 w-4" />
              {t("videoDone")}
            </div>
          ) : (
            <div className="text-sm text-[var(--warning)]">
              {t("videoMissing")}
            </div>
          )}
        </Section>

        <Section
          title={t("sectionOwnership")}
          editLabel={t("edit")}
          editHref="/seller/new/step-4?from=review"
        >
          <Row k={t("rowOwnerName")} v={draft.ownerName ?? "—"} />
          <Row k={t("rowPlate")} v={draft.registration ?? "—"} />
          {draft.ownerName && (
            <div className="text-xs text-[var(--success)] mt-1">
              {t("goldenLockPassed")}
            </div>
          )}
        </Section>

        <Section
          title={t("sectionPriceDuration")}
          editLabel={t("edit")}
          editHref="/seller/new/step-5?from=review"
        >
          <Row
            k={t("rowStartingPrice")}
            v={draft.startingPrice ? formatPrice(draft.startingPrice) : "—"}
          />
          {draft.reservePrice && (
            <Row k={t("rowReservePrice")} v={formatPrice(draft.reservePrice)} />
          )}
          {draft.buyNowPrice && (
            <Row k={t("rowBuyNow")} v={formatPrice(draft.buyNowPrice)} />
          )}
          <Row
            k={t("rowDuration")}
            v={
              draft.durationDays
                ? t("durationDays", { count: draft.durationDays })
                : "—"
            }
          />
        </Section>

        <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            {t("warnImmutable")}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            {t("agreementPrefix")}
            <LegalLink kind="terms">{t("agreementLinkText")}</LegalLink>
            {t("agreementSuffix")}
          </span>
        </label>

        <Button
          size="xl"
          fullWidth
          disabled={
            !agreed ||
            publishing ||
            missing.length > 0 ||
            !user ||
            user.kycStatus !== "verified"
          }
          onClick={() => setConfirmOpen(true)}
        >
          <Send className="h-5 w-5" />
          {publishing
            ? t("submitting")
            : !user
              ? t("loginToSubmit")
              : user.kycStatus !== "verified"
                ? t("finishKycFirst")
                : t("submitCta")}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("confirmTitle")}
        description={t("confirmBody")}
      >
        <div className="space-y-4">
          <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
            <Bullet text={t("confirmBullet1")} />
            <Bullet text={t("confirmBullet2")} />
            <Bullet text={t("confirmBullet3")} />
          </ul>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setConfirmOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button size="md" onClick={publish} disabled={publishing}>
            <Send className="h-4 w-4" />
            {publishing ? t("confirmPublishing") : t("confirmCta")}
          </Button>
        </ModalFooter>
      </Modal>
    </CreateAuctionShell>
  );
}

function Section({
  title,
  editLabel,
  editHref,
  children,
}: {
  title: string;
  editLabel: string;
  editHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-sm font-bold">{title}</span>
        <Link
          href={editHref}
          className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
        >
          <Edit2 className="h-3 w-3" />
          {editLabel}
        </Link>
      </div>
      <div className="p-4 space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--foreground-muted)] shrink-0">{k}</span>
      <span className="font-semibold text-end truncate">{v}</span>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex gap-2">
      <Check className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
      {text}
    </li>
  );
}
