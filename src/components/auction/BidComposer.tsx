"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Gavel,
  Zap,
  Info,
  CheckCircle2,
  Bot,
  Minus,
  Plus,
  Wallet,
  ShieldCheck,
  Lock,
  Gauge,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Countdown } from "@/components/auction/Countdown";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";
import { useRealtimeAuction } from "@/lib/realtime";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { anonBidder } from "@/lib/anon";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
  /** Called once on mount; useful when the parent links here with action=buy-now */
  initialAction?: string | null;
  /** SSR-known deposit status — skips the loading flash on the bid page. */
  initialDepositPaid?: boolean;
}

/**
 * The pure bid widget — status, current price, AI alerts, deposit gate,
 * input + chips + action row. No result banner, no bid history.
 * Drop this anywhere you want to enable bidding inline.
 */
export function BidComposer({
  auction: initial,
  initialAction = null,
  initialDepositPaid,
}: Props) {
  const auction = useRealtimeAuction(initial);
  const router = useRouter();
  const { toast } = useToast();
  const { user, loaded: authLoaded } = useAuth();
  const minBid = auction.currentPrice + auction.bidIncrement;
  // Display state lives in a string so the input field can show
  // exactly what the user typed (including a stray "0" while they're
  // mid-entry). `amount` is derived as the numeric value used for
  // validation and submission.
  const [amountStr, setAmountStr] = useState<string>(() => String(minBid));
  const amount = (() => {
    const n = Number(amountStr);
    return Number.isFinite(n) ? n : 0;
  })();
  function setAmount(v: number | ((prev: number) => number)) {
    const next = typeof v === "function" ? v(amount) : v;
    setAmountStr(String(Math.max(0, Math.floor(next))));
  }
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const [autoMax, setAutoMax] = useState(minBid * 2);
  const [submitting, setSubmitting] = useState(false);
  // Seed from SSR if the parent fetched it; otherwise we'll resolve in effect.
  const [depositPaid, setDepositPaid] = useState<boolean | null>(
    initialDepositPaid ?? null,
  );
  const [activeAutoMax, setActiveAutoMax] = useState<number | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);

  const isOwnAuction = user?.id === auction.seller.id;
  const auctionLive = auction.status === "active" || auction.status === "ending";
  const inc = auction.bidIncrement;

  const presets = useMemo(() => {
    const round = (n: number) => Math.round(n / inc) * inc;
    const five = Math.max(minBid, round(auction.currentPrice * 1.05));
    const ten = Math.max(minBid, round(auction.currentPrice * 1.1));
    const out = [{ key: "min", label: "Minimum", amount: minBid }];
    if (five > minBid) out.push({ key: "5", label: "+5%", amount: five });
    if (ten > five) out.push({ key: "10", label: "+10%", amount: ten });
    return out;
  }, [minBid, inc, auction.currentPrice]);

  useEffect(() => {
    // Wait for the client-side auth fetch to resolve. Without this guard, the
    // first render briefly has `user === null` (auth still loading) which
    // would clobber the SSR-seeded depositPaid back to null and flash the
    // "Préparation..." card. Once `authLoaded` is true we have the real
    // answer either way.
    if (!authLoaded) return;
    if (!user) {
      // SSR may have seeded a value when the cookie was valid; if auth says
      // we're not signed in client-side, drop it and let the gate redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepositPaid(initialDepositPaid ?? null);
      setActiveAutoMax(null);
      return;
    }
    const supabase = createClient();
    // Run both lookups in parallel — they're independent. Previously
    // they kicked off in sequence (deposit then auto-bid), adding the
    // second round-trip to the perceived "pre-bid is loading" window.
    const depositPromise =
      initialDepositPaid === undefined
        ? supabase
            .from("transactions")
            .select("id")
            .eq("user_id", user.id)
            .eq("auction_id", auction.id)
            .eq("type", "deposit")
            .eq("status", "completed")
            .limit(1)
        : null;
    const autoBidPromise = supabase
      .from("auto_bids")
      .select("max_amount, is_active")
      .eq("user_id", user.id)
      .eq("auction_id", auction.id)
      .maybeSingle();

    Promise.all([depositPromise, autoBidPromise]).then(
      ([depositRes, autoRes]) => {
        if (depositRes) {
          setDepositPaid((depositRes.data ?? []).length > 0);
        }
        const autoData = autoRes.data;
        setActiveAutoMax(
          autoData?.is_active ? Number(autoData.max_amount) : null,
        );
      },
    );
  }, [user, authLoaded, auction.id, initialDepositPaid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount((v) => (v < minBid ? minBid : v));
    // setAmount is stable (from useState); omitting per React docs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minBid]);

  // Seed the cap input with a sensible starting value: their existing cap
  // if they already set one (so they can clearly raise it), otherwise a
  // forward-looking suggestion at ~2x the next legal bid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoMax(activeAutoMax ?? minBid * 2);
  }, [activeAutoMax, minBid]);

  useEffect(() => {
    if (initialAction === "buy-now" && user && auction.buyNowPrice) {
      handleBuyNowClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, user, auction.id]);

  function handleBidClick() {
    if (!user) {
      toast("Connectez-vous pour enchérir", "info");
      router.push(`/login?redirect=/auctions/${auction.id}`);
      return;
    }
    if (isOwnAuction) {
      toast("Vous ne pouvez pas enchérir sur votre propre enchère", "warning");
      return;
    }
    if (user.kycStatus !== "verified") {
      toast("Vous devez vérifier votre identité avant d'enchérir", "warning");
      router.push("/kyc/start");
      return;
    }
    if (!auctionLive) {
      toast("Cette enchère est terminée", "warning");
      return;
    }
    if (!depositPaid) {
      router.push(
        `/payment/checkout?type=deposit&amount=${auction.participationDeposit}&auction=${auction.id}`,
      );
      return;
    }
    // AI alerts live on the auction detail page; the bid page is bidding-
    // only. Go straight to confirmation.
    setShowConfirm(true);
  }

  function handleBuyNowClick() {
    if (!user) {
      router.push(`/login?redirect=/auctions/${auction.id}`);
      return;
    }
    if (isOwnAuction) {
      toast("Vous ne pouvez pas acheter votre propre enchère", "warning");
      return;
    }
    if (user.kycStatus !== "verified") {
      toast("Vous devez vérifier votre identité avant l'achat", "warning");
      router.push("/kyc/start");
      return;
    }
    if (auction.buyNowPrice) {
      router.push(
        `/payment/checkout?type=final&amount=${auction.buyNowPrice}&auction=${auction.id}&buy_now=1`,
      );
    }
  }

  async function saveAutoBid() {
    if (!user) {
      router.push(`/login?redirect=/auctions/${auction.id}`);
      return;
    }
    if (!depositPaid) {
      toast("Payez d'abord la caution de participation", "warning");
      return;
    }
    if (activeAutoMax !== null && autoMax < activeAutoMax) {
      toast(
        `Vous ne pouvez que monter votre plafond, jamais le baisser (actuel : ${formatPrice(activeAutoMax)})`,
        "warning",
      );
      return;
    }
    setSavingAuto(true);
    const supabase = createClient();
    // Single RPC call — validates the business rules (cap >= starting,
    // cap can only rise, deposit paid, auction live), upserts the cap,
    // and places ONE proxy bid at the smallest amount needed to lead.
    const { error } = await supabase.rpc("place_auto_bid", {
      p_auction_id: auction.id,
      p_max_amount: autoMax,
    });
    setSavingAuto(false);
    if (error) {
      const code = error.message;
      const msg = code.includes("CAP_CANNOT_DECREASE")
        ? "Vous ne pouvez pas baisser votre plafond — uniquement le monter"
        : code.includes("CAP_BELOW_STARTING")
          ? "Le plafond doit être au moins égal au prix de départ"
          : code.includes("DEPOSIT_REQUIRED")
            ? "Payez d'abord la caution de participation"
            : code.includes("AUCTION_NOT_ACTIVE") || code.includes("AUCTION_ENDED")
              ? "Cette enchère est terminée"
              : code.includes("SELLER_CANNOT_BID")
                ? "Vous ne pouvez pas enchérir sur votre propre enchère"
                // Never paste raw RPC error text to users — it can leak
                // SQL/Postgres internals and is in English. Generic copy
                // + console log for debugging.
                : "Une erreur est survenue. Veuillez réessayer dans un instant.";
      if (!msg.startsWith("Vous") && !msg.startsWith("Cette") && !msg.startsWith("Le plafond") && !msg.startsWith("Payez")) {
        // Log the raw cause for ops; user only sees the sanitized copy.
        console.error("[place_auto_bid] unhandled error:", error.message);
      }
      toast(msg, "error");
      return;
    }
    setActiveAutoMax(autoMax);
    setShowAuto(false);
    toast(`Plafond activé à ${formatPrice(autoMax)}`, "success");
  }

  async function cancelAutoBid() {
    if (!user) return;
    setSavingAuto(true);
    const supabase = createClient();
    await supabase
      .from("auto_bids")
      .update({ is_active: false, cancelled_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("auction_id", auction.id);
    setActiveAutoMax(null);
    setSavingAuto(false);
    toast("Auto-enchère désactivée", "info");
  }

  async function placeBid() {
    if (!user) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("bids").insert({
      auction_id: auction.id,
      user_id: user.id,
      bidder_label: anonBidder(user.id),
      amount,
      is_auto_bid: false,
    });
    setSubmitting(false);
    setShowConfirm(false);
    if (error) {
      const msg = error.message.includes("BID_TOO_LOW")
        ? "L'offre est inférieure au minimum — le prix a changé, actualisez la page"
        : error.message.includes("AUCTION_ENDED") ||
            error.message.includes("AUCTION_NOT_ACTIVE")
          ? "Cette enchère est terminée"
          : error.message.includes("SELLER_CANNOT_BID")
            ? "Vous ne pouvez pas enchérir sur votre propre enchère"
            : error.message.includes("DEPOSIT_REQUIRED")
              ? "La caution doit être payée d'abord"
              : "Échec de l'envoi de l'offre : " + error.message;
      toast(msg, "error");
      return;
    }
    toast(`Votre offre a été envoyée ${formatPrice(amount)}`, "success");
  }

  if (!auctionLive) {
    // Auction flipped to ended/cancelled/reserve_not_met while the user
    // was on the page. The AuctionEndModal pops a celebration/sympathy
    // popup; this inline state replaces the bid form so the column
    // doesn't read as broken/empty once the modal is dismissed.
    return (
      <div className="space-y-4 lg:space-y-5 text-center py-4 lg:py-6">
        <div className="mx-auto h-12 w-12 lg:h-16 lg:w-16 rounded-full bg-red-500/15 ring-1 ring-red-500/30 text-red-300 flex items-center justify-center">
          <Lock className="h-5 w-5 lg:h-7 lg:w-7" />
        </div>
        <div>
          <div className="text-base lg:text-xl font-extrabold lg:font-black">
            Cette enchère est terminée
          </div>
          <p className="mt-1.5 text-xs lg:text-sm text-[var(--foreground-muted)] leading-relaxed max-w-xs mx-auto">
            Les offres ne sont plus acceptées. Consultez les détails pour
            voir le résultat.
          </p>
        </div>
        <Button
          size="md"
          fullWidth
          variant="secondary"
          onClick={() => router.push(`/auctions/${auction.id}`)}
          className="lg:h-12"
        >
          Voir le résultat
        </Button>
      </div>
    );
  }

  // ── Pre-bid gates ───────────────────────────────────────────────────────
  // The bid page hosts three very different states. We render distinct UIs
  // so the user is never staring at a bid input they can't actually use:
  //   1. Not logged in → invitation to sign in
  //   2. Logged in but no KYC → invitation to verify
  //   3. Logged in, KYC done, but deposit not paid → "pay entry fee" screen
  //   4. Everything OK → the actual bid composer
  // The BidComposer's job in cases 1-3 is to look like the gate it is, not
  // a half-broken bid form.

  if (!user) {
    return (
      <PreBidGate
        tone="muted"
        icon={<Lock className="h-7 w-7" />}
        title="Connectez-vous pour enchérir"
        body="Vous aurez besoin d'un compte vérifié, puis de payer la caution de participation pour rejoindre n'importe quelle enchère."
        ctaLabel="Se connecter"
        onCta={() => router.push(`/login?redirect=/auctions/${auction.id}`)}
        auction={auction}
      />
    );
  }

  if (isOwnAuction) {
    return (
      <PreBidGate
        tone="muted"
        icon={<Info className="h-7 w-7" />}
        title="Ceci est votre enchère"
        body="Vous ne pouvez pas enchérir sur une enchère que vous publiez. Suivez l'activité des enchérisseurs depuis le Tableau du vendeur."
        ctaLabel="Voir les statistiques de l'enchère"
        onCta={() => router.push(`/seller/auctions/${auction.id}`)}
        auction={auction}
      />
    );
  }

  if (user.kycStatus !== "verified") {
    return (
      <PreBidGate
        tone="warning"
        icon={<ShieldCheck className="h-7 w-7" />}
        title="Vérifiez votre identité pour participer"
        body="Nous devons confirmer votre identité une seule fois avant que vous puissiez enchérir. La vérification prend deux minutes."
        ctaLabel="Commencer la vérification"
        onCta={() => router.push("/kyc/start")}
        auction={auction}
      />
    );
  }

  if (depositPaid === null) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
          <span className="h-3 w-3 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
          Préparation...
        </div>
      </div>
    );
  }

  if (depositPaid === false) {
    // Body and bullets used to overlap ("we hold X as refundable deposit"
    // appeared in both). Body is now a single short line, the three bullets
    // carry the operational details — no repetition.
    return (
      <PreBidGate
        tone="gold"
        icon={<Wallet className="h-7 w-7" />}
        title="Payez la caution de participation pour rejoindre l'enchère"
        body={`Caution remboursable de ${formatPrice(auction.participationDeposit)} — active l'enchère immédiatement.`}
        ctaLabel={`Payer ${formatPrice(auction.participationDeposit)}`}
        ctaIcon={<Wallet className="h-4 w-4" />}
        onCta={() =>
          router.push(
            `/payment/checkout?type=deposit&amount=${auction.participationDeposit}&auction=${auction.id}`,
          )
        }
        auction={auction}
        bullets={[
          "Montant fixe selon le prix de départ — réserve votre place dans l'enchère",
          "Intégralement remboursée sous 24 heures si vous ne gagnez pas",
          "Déduite du prix final si vous gagnez",
        ]}
      />
    );
  }

  // Deposit paid — render the full bid composer below.
  const ctaLabel = `Enchérir à ${formatPrice(amount)}`;
  const ctaDisabled = submitting;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Status — single inline run, no flex tricks */}
      <div className="flex items-center gap-2 text-[11px] lg:text-[12px] text-[var(--foreground-muted)] flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
          <span className="text-[10px] lg:text-[11px] font-bold text-[var(--gold)] uppercase tracking-[0.2em]">
            En direct
          </span>
        </span>
        <span className="text-[var(--border-strong)]">·</span>
        <Countdown endTime={auction.endTime} size="sm" withIcon={false} />
        <button
          onClick={() => setShowRules(true)}
          className="ms-auto inline-flex items-center gap-1 hover:text-[var(--gold)]"
        >
          <Info className="h-3 w-3" />
          Règles
        </button>
      </div>

      {/* Price block — vertical stack, all left-aligned. Bigger on desktop. */}
      <div>
        <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] lg:tracking-[0.22em] font-bold text-[var(--foreground-subtle)] lg:text-[var(--foreground-muted)] mb-1 lg:mb-1.5">
          Prix actuel
        </div>
        <div className="text-3xl lg:text-[44px] xl:text-[52px] font-extrabold lg:font-black tabular-nums leading-none gradient-gold-text">
          <span key={auction.currentPrice} className="inline-block animate-fade-in">
            {formatPrice(auction.currentPrice)}
          </span>
        </div>
        <div className="text-[11px] lg:text-[12px] text-[var(--foreground-muted)] mt-2 lg:mt-3 tabular-nums">
          {auction.totalBids} {auction.totalBids === 1 ? "offre" : "offres"} · {auction.totalParticipants} {auction.totalParticipants === 1 ? "participant" : "participants"}
          {auction.reservePrice && (
            <>
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <span
                className={cn(
                  "font-bold",
                  auction.reserveMet
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]",
                )}
              >
                Reserve {auction.reserveMet ? "✓" : "✗"}
              </span>
            </>
          )}
        </div>
      </div>

      {(
        <>
          {/* Hairline divider */}
          <div className="h-px bg-[var(--border)]" />

          {/* Bid input section */}
          <div className="space-y-2 lg:space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] lg:tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
                Votre offre
              </span>
              <span
                className={cn(
                  "tabular-nums font-bold text-[11px] lg:text-[12px]",
                  amount < minBid
                    ? "text-[var(--danger)]"
                    : amount === minBid
                      ? "text-[var(--foreground-subtle)]"
                      : "text-[var(--gold)]",
                )}
              >
                {amount < minBid
                  ? `< ${formatPrice(minBid)}`
                  : amount === minBid
                    ? `Minimum · incrément ${formatPrice(inc)}`
                    : `+${formatPrice(amount - auction.currentPrice)}`}
              </span>
            </div>

            <div
              className={cn(
                "flex items-stretch h-12 lg:h-16 rounded-[var(--radius)] lg:rounded-2xl overflow-hidden border transition-colors",
                amount < minBid
                  ? "border-[var(--danger)]/50"
                  : "border-[var(--border)] focus-within:border-[var(--gold)]",
              )}
            >
              <button
                onClick={() => setAmount((v) => Math.max(minBid, v - inc))}
                disabled={amount <= minBid}
                aria-label="Réduire"
                className="px-3 lg:px-5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Minus className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => {
                  // Keep digits only — the underlying numeric `amount`
                  // re-derives automatically. Whatever the user typed
                  // stays visible until blur normalises it.
                  setAmountStr(e.target.value.replace(/\D/g, ""));
                }}
                onFocus={(e) => {
                  // Select all on focus so the user can overtype the
                  // existing value without manual erase — matches the
                  // pattern of every native iOS / Android amount field.
                  e.currentTarget.select();
                }}
                onBlur={() => {
                  // On blur: clamp to minBid and drop any leading-zero
                  // weirdness. If the field is empty, fall back to
                  // minBid so we never submit NaN / 0.
                  const n = Number(amountStr);
                  const clamped =
                    Number.isFinite(n) && n >= minBid ? n : minBid;
                  setAmountStr(String(clamped));
                }}
                className="flex-1 bg-transparent text-center text-xl lg:text-2xl xl:text-3xl font-extrabold tabular-nums focus:outline-none"
                aria-label="votre offre"
              />
              <button
                onClick={() => setAmount((v) => Math.max(minBid, v) + inc)}
                aria-label="Incrément"
                className="px-3 lg:px-5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center"
              >
                <Plus className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 lg:gap-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setAmount(p.amount)}
                  className={cn(
                    "h-7 lg:h-9 px-2.5 lg:px-4 rounded-full text-[11px] lg:text-[12px] font-bold tabular-nums transition-colors",
                    amount === p.amount
                      ? "bg-[var(--gold)] text-black"
                      : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--gold)]/50 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action: full-width primary + secondary text links underneath.
              Mobile: sticks to the bottom of the viewport so users never
              lose sight of the bid CTA while scrolling through the
              vehicle details / bid history. The backdrop-blur container
              bleeds to screen edges and respects the iOS home-indicator
              safe area. Desktop layout stays inline (lg: resets the
              sticky positioning and background). */}
          <div
            className={cn(
              "space-y-2.5",
              // Mobile sticky shell
              "sticky bottom-0 z-30 -mx-4 px-4 py-3",
              "bg-[#0a0a0a]/95 backdrop-blur-xl",
              "border-t border-[var(--border)]",
              "pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
              // Desktop reset — stays inline inside the card
              "lg:static lg:bottom-auto lg:mx-0 lg:px-0 lg:py-0",
              "lg:bg-transparent lg:backdrop-blur-none",
              "lg:border-0 lg:pb-0 lg:space-y-3",
            )}
          >
            <Button
              size="md"
              fullWidth
              onClick={handleBidClick}
              disabled={ctaDisabled}
              className="lg:h-14 lg:text-base lg:rounded-full"
            >
              <Gavel className="h-4 w-4 lg:h-5 lg:w-5" />
              {ctaLabel}
            </Button>

            <div className="flex items-center justify-center gap-3 text-[11px] lg:text-[12px]">
              <button
                onClick={() => setShowAuto(true)}
                className={cn(
                  "inline-flex items-center gap-1 lg:gap-1.5 font-semibold transition-colors",
                  activeAutoMax
                    ? "text-[var(--gold)]"
                    : "text-[var(--foreground-muted)] hover:text-[var(--gold)]",
                )}
              >
                <Bot className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                {activeAutoMax
                  ? `Plafond ${formatPrice(activeAutoMax)}`
                  : "Plafond automatique"}
              </button>
              {auction.buyNowPrice && (
                <>
                  <span className="text-[var(--border-strong)]">·</span>
                  <button
                    onClick={handleBuyNowClick}
                    className="inline-flex items-center gap-1 lg:gap-1.5 font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors"
                  >
                    <Zap className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                    Achat immédiat {formatPrice(auction.buyNowPrice)}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmer l'offre"
      >
        <div className="space-y-5">
          {/* Hero amount */}
          <div className="text-center py-2">
            <div className="text-4xl font-extrabold gradient-gold-text tabular-nums leading-none">
              {formatPrice(amount)}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-[var(--foreground-muted)] tabular-nums">
              <span className="line-through opacity-60">
                {formatPrice(auction.currentPrice)}
              </span>
              <span className="text-[var(--gold)] font-bold">
                +{formatPrice(amount - auction.currentPrice)}
              </span>
              <span className="text-[var(--foreground-subtle)]">
                ({(((amount - auction.currentPrice) / auction.currentPrice) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Auction context — vehicle + countdown */}
          <div className="rounded-[var(--radius)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
            <div className="flex items-center justify-between px-3 py-2.5 text-xs">
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--foreground-muted)]">
                Véhicule
              </span>
              <span className="font-bold truncate ms-3">
                {auction.vehicle.make} {auction.vehicle.model}{" "}
                {auction.vehicle.year}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 text-xs">
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--foreground-muted)]">
                Restant
              </span>
              <Countdown endTime={auction.endTime} size="sm" withIcon={false} />
            </div>
          </div>

          {/* Reassurance */}
          <p className="text-[11px] text-center text-[var(--foreground-subtle)] leading-relaxed">
            Votre offre est enregistrée immédiatement et apparaît à tous les enchérisseurs en temps réel.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setShowConfirm(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={placeBid} disabled={submitting}>
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Envoi en cours..." : `Confirmer ${formatPrice(amount)}`}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={showRules} onClose={() => setShowRules(false)} title="Règles de l'enchère">
        <ul className="space-y-3 text-sm text-[var(--foreground-muted)] leading-relaxed">
          <li>• <strong className="text-foreground">Caution :</strong> Montant fixe (500 / 1 000 / 2 000 DT selon le prix de départ), payée une fois par enchère, remboursée si vous ne gagnez pas.</li>
          <li>• <strong className="text-foreground">Anti-Sniping:</strong> Toute offre dans les 5 dernières minutes prolonge l&apos;enchère de 5 minutes.</li>
          <li>• <strong className="text-foreground">Réserve :</strong> Si le prix de réserve n&apos;est pas atteint, l&apos;enchère n&apos;est pas conclue.</li>
          <li>• <strong className="text-foreground">Plafond automatique :</strong> Vous fixez un montant maximum caché. Le système enchérit pour vous au minimum nécessaire pour devancer le 2ᵉ plafond — jamais plus.</li>
          <li>• <strong className="text-foreground">Retrait après victoire :</strong> Caution saisie + bannissement 30 jours.</li>
        </ul>
      </Modal>

      <Modal
        open={showAuto}
        onClose={() => setShowAuto(false)}
        title="Plafond automatique"
        description="Indiquez le montant maximum que vous êtes prêt à payer. Reste caché des autres."
      >
        <div className="space-y-4">
          {activeAutoMax && (
            <div className="rounded-[var(--radius)] bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs">
              <span className="font-bold text-emerald-300">
                Plafond actuel : {formatPrice(activeAutoMax)} —
              </span>{" "}
              <span className="text-emerald-300/80">
                vous ne pouvez que le monter
              </span>
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Votre plafond maximum
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={autoMax === 0 ? "" : autoMax}
              onChange={(e) => {
                const v = e.target.value
                  .replace(/\D/g, "")
                  .replace(/^0+(?=\d)/, "");
                setAutoMax(v === "" ? 0 : Number(v));
              }}
              className="mt-1.5 w-full h-12 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] text-center text-lg font-extrabold tabular-nums focus:outline-none focus:border-[var(--gold)]"
            />
            {activeAutoMax !== null && autoMax < activeAutoMax && (
              <div className="mt-2 text-[11px] text-[var(--danger)] font-semibold">
                Le plafond ne peut être que monté (≥ {formatPrice(activeAutoMax)}).
              </div>
            )}
          </div>

          {/* Proxy bidding explanation — clear three-line summary so the
              user understands they're NOT committing to pay this amount;
              they only pay what's needed to beat the next-highest cap. */}
          <ul className="space-y-1.5 text-[11px] text-[var(--foreground-muted)] leading-relaxed">
            <li className="flex gap-2">
              <span className="text-[var(--gold)]">•</span>
              <span>
                Vous payez seulement <strong className="text-foreground">le minimum nécessaire</strong> pour devancer le 2ᵉ plafond — jamais votre plafond intégral.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--gold)]">•</span>
              <span>
                Votre plafond reste <strong className="text-foreground">caché</strong> des autres enchérisseurs et du vendeur.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--gold)]">•</span>
              <span>
                En cas d&apos;égalité de plafond, <strong className="text-foreground">le plus ancien gagne</strong>.
              </span>
            </li>
          </ul>
        </div>
        <ModalFooter>
          {activeAutoMax && (
            <Button variant="danger" size="md" onClick={cancelAutoBid} disabled={savingAuto}>
              Désactiver
            </Button>
          )}
          <Button variant="ghost" size="md" onClick={() => setShowAuto(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={saveAutoBid} disabled={savingAuto}>
            {savingAuto ? "Enregistrement..." : activeAutoMax ? "Monter le plafond" : "Activer"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/**
 * Replaces the bid composer when the user can't actually bid yet — login,
 * KYC, deposit, own-auction. Looks distinctly *not* like a bid form so the
 * user knows the next step is something else.
 *
 * Two layouts kept in parallel:
 *   - Mobile (<lg): compact card stack — same shape it always was.
 *   - Desktop (lg+): magazine-style 2-col split — vehicle hero on the
 *     start, gate card on the end with much bigger typography and trust
 *     signals. The user sees which car they're committing money to right
 *     next to the deposit CTA.
 */
function PreBidGate({
  tone,
  icon,
  title,
  body,
  ctaLabel,
  ctaIcon,
  onCta,
  bullets,
  auction,
}: {
  tone: "muted" | "warning" | "gold";
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel: string;
  ctaIcon?: React.ReactNode;
  onCta: () => void;
  bullets?: string[];
  auction: Auction;
}) {
  const { vehicle, currentPrice, endTime, totalBids, totalParticipants } =
    auction;

  const palette = {
    muted: {
      ring: "border-[var(--border)]",
      bg: "bg-[var(--surface)]",
      iconBg: "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
    },
    warning: {
      ring: "border-amber-500/40",
      bg: "bg-amber-500/5",
      iconBg: "bg-amber-500/15 text-amber-400",
    },
    gold: {
      ring: "border-[var(--gold)]/40",
      bg: "bg-gradient-to-br from-[var(--surface)] to-[#1a1408]",
      iconBg:
        "bg-[var(--gold-faint)] text-[var(--gold)] shadow-[var(--shadow-gold)]",
    },
  }[tone];

  return (
    <>
      {/* ==================================================================
          MOBILE (<lg) — original compact layout, untouched.
          ================================================================== */}
      <div className="lg:hidden space-y-4">
        {/* Tight inline context — current price on the start, live pill +
            countdown + bid count on the end. */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="text-2xl font-extrabold tabular-nums leading-none gradient-gold-text">
            {formatPrice(currentPrice)}
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[var(--gold)] text-[10px] font-bold uppercase tracking-[0.15em]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
              En direct
            </span>
            <Countdown endTime={endTime} size="sm" withIcon={false} className="text-[11px]" />
            <span className="text-[var(--border-strong)]">·</span>
            <span className="tabular-nums">{totalBids} {totalBids === 1 ? "offre" : "offres"}</span>
          </div>
        </div>

        <div
          className={`rounded-[var(--radius-md)] border ${palette.ring} ${palette.bg} p-5 space-y-4`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`h-12 w-12 rounded-full ${palette.iconBg} flex items-center justify-center shrink-0`}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-base leading-tight">{title}</h3>
              <p className="text-xs text-[var(--foreground-muted)] mt-1.5 leading-relaxed">
                {body}
              </p>
            </div>
          </div>

          {bullets && bullets.length > 0 && (
            <ul className="space-y-1.5 text-xs text-[var(--foreground-muted)] ms-1">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--gold)] shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <Button onClick={onCta} size="md" fullWidth>
            {ctaIcon}
            {ctaLabel}
          </Button>
        </div>
      </div>

      {/* ==================================================================
          DESKTOP (lg+) — magazine 2-col layout: vehicle hero + gate card.
          ================================================================== */}
      <div className="hidden lg:grid grid-cols-[1.1fr_1fr] gap-8 xl:gap-10 items-start">
        {/* ── Vehicle hero ── */}
        <div className="relative rounded-[28px] overflow-hidden ring-1 ring-white/10 bg-[var(--surface)] aspect-[4/3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(vehicle.imageUrls[0], { width: 1200, quality: 75 })}
            alt={`${vehicle.make} ${vehicle.model}`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />

          {/* Top — live pill + countdown */}
          <div className="absolute inset-x-0 top-0 p-5 flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                En direct
              </span>
            </span>
            <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/10 text-white">
              <Clock className="h-3.5 w-3.5 text-[var(--gold)]" />
              <Countdown
                endTime={endTime}
                size="sm"
                withIcon={false}
                className="text-[12px] font-bold tabular-nums text-white"
              />
            </span>
          </div>

          {/* Bottom — title + price */}
          <div className="absolute inset-x-0 bottom-0 p-7">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)] mb-1.5">
              Vous enchérissez sur
            </div>
            <h2 className="text-3xl xl:text-[34px] font-black text-white leading-[1.05] tracking-tight">
              {vehicle.make} {vehicle.model}
            </h2>
            <div className="mt-1.5 text-base text-white/75 font-light flex items-center gap-3 flex-wrap">
              <span>{vehicle.year}</span>
              {vehicle.color && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  <span>{vehicle.color}</span>
                </>
              )}
              {vehicle.mileage > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  <span className="inline-flex items-center gap-1.5">
                    <Gauge className="h-4 w-4" />
                    {Intl.NumberFormat("fr-TN").format(vehicle.mileage)} km
                  </span>
                </>
              )}
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/60">
                  Prix actuel
                </div>
                <div className="mt-1 text-[34px] xl:text-[40px] font-black gradient-gold-text tabular-nums leading-none">
                  {formatPrice(currentPrice)}
                </div>
              </div>
              <div className="flex items-center gap-4 text-white/85 text-[13px] pb-1.5">
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Gavel className="h-4 w-4 text-[var(--gold)]" />
                  {totalBids} {totalBids === 1 ? "offre" : "offres"}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Users className="h-4 w-4 text-[var(--gold)]" />
                  {totalParticipants}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Gate card (right column) ── */}
        <div
          className={`relative overflow-hidden rounded-[28px] border ${palette.ring} ${palette.bg} p-9 xl:p-10`}
        >
          {/* Decorative glow for the gold (deposit) tone */}
          {tone === "gold" && (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -end-20 h-56 w-56 rounded-full bg-[var(--gold)] blur-3xl opacity-20"
            />
          )}

          <div className="relative space-y-7">
            <div
              className={`h-16 w-16 rounded-2xl ${palette.iconBg} flex items-center justify-center`}
            >
              {icon}
            </div>

            <div>
              <h3 className="text-3xl xl:text-[34px] font-black tracking-tight leading-[1.1]">
                {title}
              </h3>
              <p className="mt-3 text-[15px] text-[var(--foreground-muted)] leading-relaxed">
                {body}
              </p>
            </div>

            {bullets && bullets.length > 0 && (
              <ul className="space-y-3">
                {bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl bg-black/20 ring-1 ring-white/5 p-3.5"
                  >
                    <span className="h-7 w-7 rounded-full bg-[var(--gold)]/20 ring-1 ring-[var(--gold)]/40 text-[var(--gold)] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span className="text-[14px] text-foreground/90 leading-snug">
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={onCta}
              className={cn(
                "group inline-flex items-center justify-center gap-2 w-full h-14 rounded-full font-extrabold text-[15px] transition-transform hover:scale-[1.01] active:scale-[0.99]",
                tone === "gold"
                  ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
                  : tone === "warning"
                    ? "bg-amber-400 text-black shadow-[0_8px_24px_-4px_rgba(245,158,11,0.5)]"
                    : "bg-foreground text-background",
              )}
            >
              {ctaIcon}
              {ctaLabel}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Tiny reassurance footer — only on the gold (deposit) tone
                where money is changing hands. */}
            {tone === "gold" && (
              <div className="flex items-center justify-center gap-4 text-[11px] text-[var(--foreground-subtle)] pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)]" />
                  Paiement sécurisé
                </span>
                <span className="text-[var(--border-strong)]">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[var(--gold)]" />
                  Remboursement sous 24 h
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
