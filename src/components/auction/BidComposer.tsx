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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Countdown } from "@/components/auction/Countdown";
import { formatPrice } from "@/lib/format";
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
  const [amount, setAmount] = useState(minBid);
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
      setDepositPaid(initialDepositPaid ?? null);
      setActiveAutoMax(null);
      return;
    }
    const supabase = createClient();
    // Only fetch deposit status if the parent didn't already give us one
    // server-side.
    if (initialDepositPaid === undefined) {
      supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("auction_id", auction.id)
        .eq("type", "deposit")
        .eq("status", "completed")
        .limit(1)
        .then(({ data }) => setDepositPaid((data ?? []).length > 0));
    }

    supabase
      .from("auto_bids")
      .select("max_amount, is_active")
      .eq("user_id", user.id)
      .eq("auction_id", auction.id)
      .maybeSingle()
      .then(({ data }) =>
        setActiveAutoMax(data?.is_active ? Number(data.max_amount) : null),
      );
  }, [user, authLoaded, auction.id, initialDepositPaid]);

  useEffect(() => {
    setAmount((v) => (v < minBid ? minBid : v));
  }, [minBid]);

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
    if (autoMax < minBid) {
      toast(`Le maximum doit être au moins ${formatPrice(minBid)}`, "warning");
      return;
    }
    setSavingAuto(true);
    const supabase = createClient();
    const { error } = await supabase.from("auto_bids").upsert(
      { auction_id: auction.id, user_id: user.id, max_amount: autoMax, is_active: true },
      { onConflict: "auction_id,user_id" },
    );
    setSavingAuto(false);
    if (error) {
      toast("Échec de l'enregistrement de l'auto-enchère : " + error.message, "error");
      return;
    }
    setActiveAutoMax(autoMax);
    setShowAuto(false);
    toast(`Auto-enchère activée jusqu'à ${formatPrice(autoMax)}`, "success");
    if (auction.currentPrice + auction.bidIncrement <= autoMax) {
      await supabase.from("bids").insert({
        auction_id: auction.id,
        user_id: user.id,
        // Anonymous handle — never store the user's real name on the bid
        // row. Other bidders and the seller only ever see this opaque tag.
        bidder_label: anonBidder(user.id),
        amount: auction.currentPrice + auction.bidIncrement,
        is_auto_bid: true,
      });
    }
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
    return null;
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
        body="Vous aurez besoin d'un compte vérifié, puis de payer la caution de participation (5%) pour rejoindre n'importe quelle enchère."
        ctaLabel="Se connecter"
        onCta={() => router.push(`/login?redirect=/auctions/${auction.id}`)}
        currentPrice={auction.currentPrice}
        endTime={auction.endTime}
        totalBids={auction.totalBids}
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
        currentPrice={auction.currentPrice}
        endTime={auction.endTime}
        totalBids={auction.totalBids}
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
        currentPrice={auction.currentPrice}
        endTime={auction.endTime}
        totalBids={auction.totalBids}
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
        currentPrice={auction.currentPrice}
        endTime={auction.endTime}
        totalBids={auction.totalBids}
        bullets={[
          "5% du prix de départ, réserve votre place dans l'enchère",
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
    <div className="space-y-4">
      {/* Status — single inline run, no flex tricks */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--foreground-muted)] flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
          <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.2em]">
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

      {/* Price block — vertical stack, all left-aligned */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-subtle)] mb-1">
          Prix actuel
        </div>
        <div className="text-3xl font-extrabold tabular-nums leading-none gradient-gold-text">
          {formatPrice(auction.currentPrice)}
        </div>
        <div className="text-[11px] text-[var(--foreground-muted)] mt-2 tabular-nums">
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
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)]">
                Votre offre
              </span>
              <span
                className={cn(
                  "tabular-nums font-bold text-[11px]",
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
                "flex items-stretch h-12 rounded-[var(--radius)] overflow-hidden border transition-colors",
                amount < minBid
                  ? "border-[var(--danger)]/50"
                  : "border-[var(--border)] focus-within:border-[var(--gold)]",
              )}
            >
              <button
                onClick={() => setAmount((v) => Math.max(minBid, v - inc))}
                disabled={amount <= minBid}
                aria-label="Réduire"
                className="px-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={amount === 0 ? "" : amount}
                onChange={(e) => {
                  const v = e.target.value
                    .replace(/\D/g, "")
                    .replace(/^0+(?=\d)/, "");
                  setAmount(v === "" ? 0 : Number(v));
                }}
                onBlur={() => {
                  if (amount < minBid) setAmount(minBid);
                }}
                className="flex-1 bg-transparent text-center text-xl font-extrabold tabular-nums focus:outline-none"
                aria-label="votre offre"
              />
              <button
                onClick={() => setAmount((v) => Math.max(minBid, v) + inc)}
                aria-label="Incrément"
                className="px-3 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setAmount(p.amount)}
                  className={cn(
                    "h-7 px-2.5 rounded-full text-[11px] font-bold tabular-nums transition-colors",
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

          {/* Action: full-width primary + secondary text links underneath */}
          <div className="space-y-2.5">
            <Button
              size="md"
              fullWidth
              onClick={handleBidClick}
              disabled={ctaDisabled}
            >
              <Gavel className="h-4 w-4" />
              {ctaLabel}
            </Button>

            <div className="flex items-center justify-center gap-3 text-[11px]">
              <button
                onClick={() => setShowAuto(true)}
                className={cn(
                  "inline-flex items-center gap-1 font-semibold transition-colors",
                  activeAutoMax
                    ? "text-[var(--gold)]"
                    : "text-[var(--foreground-muted)] hover:text-[var(--gold)]",
                )}
              >
                <Bot className="h-3 w-3" />
                {activeAutoMax
                  ? `Auto jusqu'à ${formatPrice(activeAutoMax)}`
                  : "Auto-Bid"}
              </button>
              {auction.buyNowPrice && (
                <>
                  <span className="text-[var(--border-strong)]">·</span>
                  <button
                    onClick={handleBuyNowClick}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors"
                  >
                    <Zap className="h-3 w-3" />
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
          <li>• <strong className="text-foreground">Caution 5%:</strong> Payée une fois par enchère, remboursée si vous ne gagnez pas.</li>
          <li>• <strong className="text-foreground">Anti-Sniping:</strong> Toute offre dans les 5 dernières minutes prolonge l'enchère de 5 minutes.</li>
          <li>• <strong className="text-foreground">Réserve :</strong> Si le prix de réserve n'est pas atteint, l'enchère n'est pas conclue.</li>
          <li>• <strong className="text-foreground">Auto-enchère :</strong> Enchérit en votre nom jusqu'au maximum.</li>
          <li>• <strong className="text-foreground">Retrait après victoire :</strong> Caution saisie + bannissement 30 jours.</li>
        </ul>
      </Modal>

      <Modal
        open={showAuto}
        onClose={() => setShowAuto(false)}
        title="Configurer l'auto-enchère"
        description="Nous enchérissons en votre nom jusqu'au maximum"
      >
        <div className="space-y-3">
          {activeAutoMax && (
            <div className="rounded-[var(--radius)] bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs">
              <span className="font-bold text-emerald-300">
                Auto-enchère activée jusqu'à {formatPrice(activeAutoMax)}
              </span>
            </div>
          )}
          <label className="text-xs font-semibold text-[var(--foreground-muted)]">
            Maximum
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
            className="w-full h-11 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] text-center text-base font-bold tabular-nums focus:outline-none focus:border-[var(--gold)]"
          />
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            À chaque nouvelle offre, nous proposons une contre-offre avec l'incrément minimum, jusqu'à ce que votre offre maximum de {formatPrice(autoMax)} soit atteinte.
          </p>
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
            {savingAuto ? "Enregistrement..." : activeAutoMax ? "Mettre à jour" : "Activer"}
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
  currentPrice,
  endTime,
  totalBids,
}: {
  tone: "muted" | "warning" | "gold";
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel: string;
  ctaIcon?: React.ReactNode;
  onCta: () => void;
  bullets?: string[];
  currentPrice: number;
  endTime: Date;
  totalBids: number;
}) {
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
    <div className="space-y-4">
      {/* Tight inline context — current price on the start, live pill +
          countdown + bid count on the end. The "En direct" pill makes the
          live state legible at a glance (was just a tiny dot before). */}
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

      {/* Gate card — this is where the user's eye should land */}
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
  );
}
