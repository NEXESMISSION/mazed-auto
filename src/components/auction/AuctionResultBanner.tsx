"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Trophy,
  XCircle,
  Hourglass,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
}

type Outcome =
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "winner"; finalPaid: boolean; remaining: number; myBid: number }
  | { kind: "loser_ended" }
  | { kind: "loser_reserve_not_met" }
  | { kind: "no_bids" }
  | { kind: "seller_decision_seller"; topBid: number; reserve: number; deadline: Date }
  | { kind: "seller_decision_top_bidder"; topBid: number; reserve: number; deadline: Date }
  | { kind: "seller_decision_other"; topBid: number; deadline: Date };

const FINAL_STATES = [
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
];

export function AuctionResultBanner({ auction }: Props) {
  const { user, loaded } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });
  const [decisionOpen, setDecisionOpen] = useState<"accept" | "reject" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const isFinal = FINAL_STATES.includes(auction.status);
  const isSeller = user?.id === auction.seller.id;

  useEffect(() => {
    if (!loaded) return;
    if (!isFinal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutcome({ kind: "live" });
      return;
    }
    if (auction.status === "cancelled" || auction.totalBids === 0) {
      setOutcome({ kind: "no_bids" });
      return;
    }

    if (auction.status === "pending_seller_decision") {
      const deadline =
        auction.reserveDecisionDeadline ??
        new Date(Date.now() + 3 * 24 * 3600 * 1000);
      const reserve = auction.reservePrice ?? 0;
      const top = auction.currentPrice;

      if (isSeller) {
        setOutcome({
          kind: "seller_decision_seller",
          topBid: top,
          reserve,
          deadline,
        });
        return;
      }
      // Need to know if the current user is the top bidder
      if (!user) {
        setOutcome({ kind: "seller_decision_other", topBid: top, deadline });
        return;
      }
      const supabase = createClient();
      // Round-21 audit fix H-1: bids.user_id is no longer publicly
      // readable. is_top_bidder() RPC answers without leaking IDs.
      supabase
        .rpc("is_top_bidder", {
          p_auction_id: auction.id,
          p_user_id: user.id,
        })
        .then(({ data: isTop }) => {
          if (isTop) {
            setOutcome({
              kind: "seller_decision_top_bidder",
              topBid: top,
              reserve,
              deadline,
            });
          } else {
            setOutcome({
              kind: "seller_decision_other",
              topBid: top,
              deadline,
            });
          }
        });
      return;
    }

    if (auction.status === "reserve_not_met") {
      setOutcome({ kind: "loser_reserve_not_met" });
      return;
    }

    // status === 'ended' — am I the winner?
    if (!user) {
      setOutcome({ kind: "loser_ended" });
      return;
    }
    const supabase = createClient();
    (async () => {
      // Round-21 audit fix H-1: use is_top_bidder() since bids.user_id
      // is no longer publicly readable. Then read the user's own top
      // bid amount (allowed by the new owner-clause RLS) for display.
      const { data: isWinner } = await supabase.rpc("is_top_bidder", {
        p_auction_id: auction.id,
        p_user_id: user.id,
      });
      if (!isWinner) {
        setOutcome({ kind: "loser_ended" });
        return;
      }
      const { data: own } = await supabase
        .from("bids")
        .select("amount")
        .eq("auction_id", auction.id)
        .eq("user_id", user.id)
        .order("amount", { ascending: false })
        .limit(1);
      const myBid = Number(own?.[0]?.amount ?? auction.currentPrice);
      const { data: paid } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("auction_id", auction.id)
        .eq("type", "final_payment")
        .eq("status", "completed")
        .limit(1);
      setOutcome({
        kind: "winner",
        myBid,
        finalPaid: (paid ?? []).length > 0,
        remaining: Math.max(0, myBid - auction.participationDeposit),
      });
    })();
  }, [
    auction.id,
    auction.status,
    auction.currentPrice,
    auction.totalBids,
    auction.reservePrice,
    auction.participationDeposit,
    auction.reserveDecisionDeadline,
    isFinal,
    isSeller,
    user,
    loaded,
  ]);

  async function decide(action: "accept" | "reject") {
    if (!user) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc(
      action === "accept"
        ? "seller_accept_under_reserve"
        : "seller_reject_under_reserve",
      { p_auction_id: auction.id },
    );
    setSubmitting(false);
    setDecisionOpen(null);
    if (error) {
      toast("Échec de l'exécution de la décision : " + error.message, "error");
      return;
    }
    toast(
      action === "accept" ? "Offre acceptée — Finalisation de l'enchère" : "Offre refusée",
      "success",
    );
    router.refresh();
  }

  if (outcome.kind === "loading" || outcome.kind === "live") return null;

  // Unrelated bidders should NOT see the "waiting for seller decision"
  // banner — that's a private matter between the seller and the top
  // bidder. Hide it for everyone else.
  if (outcome.kind === "seller_decision_other") return null;

  return (
    <>
      {renderBanner()}

      {/* Winner-only popup — fires once per auction per session so the
          top bidder is told their offer is under review the moment they
          enter the page. The inline banner below is a quieter reminder
          for return visits. */}
      {outcome.kind === "seller_decision_top_bidder" && (
        <WinnerPopup auction={auction} outcome={outcome} />
      )}

      <Modal
        open={decisionOpen !== null}
        onClose={() => setDecisionOpen(null)}
        title={decisionOpen === "accept" ? "Accepter l'offre" : "Refuser l'offre"}
        description={
          decisionOpen === "accept"
            ? "Vous vendrez la voiture à un prix inférieur au prix de réserve"
            : "L'enchère sera annulée et toutes les cautions remboursées"
        }
      >
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          {decisionOpen === "accept"
            ? "Après acceptation, il n'est plus possible de revenir en arrière. Le gagnant sera notifié pour le paiement final."
            : "Après refus, il n'est plus possible de revenir en arrière. Tous les enchérisseurs seront remboursés de leur caution."}
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setDecisionOpen(null)}
          >
            Annuler
          </Button>
          <Button
            size="md"
            variant={decisionOpen === "accept" ? "primary" : "danger"}
            onClick={() => decide(decisionOpen!)}
            disabled={submitting}
          >
            {submitting ? "Exécution..." : "Confirmer"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );

  function renderBanner() {
    switch (outcome.kind) {
      case "winner":
        return (
          <Banner
            tone="gold"
            icon={<Trophy className="h-7 w-7" />}
            title="Vous avez gagné l'enchère"
            body={
              outcome.finalPaid ? (
                <>
                  Paiement effectué intégralement ({formatPrice(outcome.myBid)}). Contactez le vendeur pour la livraison de la voiture.
                </>
              ) : (
                <>
                  Offre gagnante : <strong>{formatPrice(outcome.myBid)}</strong>.
                  Caution {formatPrice(auction.participationDeposit)} déduite — restant{" "}
                  <strong>{formatPrice(outcome.remaining)}</strong>.
                </>
              )
            }
            action={
              !outcome.finalPaid && (
                <Link
                  href={`/payment/checkout?type=final&auction=${auction.id}&amount=${outcome.remaining}`}
                >
                  <Button size="md">Payer le solde</Button>
                </Link>
              )
            }
          />
        );

      case "loser_ended":
        return (
          <Banner
            tone="muted"
            icon={<XCircle className="h-6 w-6" />}
            title="Enchère terminée"
            body="La voiture a été vendue à un autre enchérisseur. Votre caution sera remboursée sous 24 heures."
            action={
              <Link href="/auctions">
                <Button size="md" variant="secondary">
                  autres enchères
                </Button>
              </Link>
            }
          />
        );

      case "loser_reserve_not_met":
        return (
          <Banner
            tone="muted"
            icon={<XCircle className="h-6 w-6" />}
            title="L'enchère n'a pas atteint le prix de réserve"
            body="La vente a été annulée. Votre caution sera remboursée sous 24 heures."
            action={
              <Link href="/auctions">
                <Button size="md" variant="secondary">
                  autres enchères
                </Button>
              </Link>
            }
          />
        );

      case "no_bids":
        return (
          <Banner
            tone="muted"
            icon={<XCircle className="h-6 w-6" />}
            title="Enchère terminée sans offre"
            body="Personne n'a fait d'offre sur cette enchère."
          />
        );

      case "seller_decision_seller":
        return (
          <Banner
            tone="amber"
            icon={<Hourglass className="h-7 w-7" />}
            title="Votre enchère nécessite votre décision"
            body={
              <>
                <div>
                  Offre la plus haute : <strong>{formatPrice(outcome.topBid)}</strong> — Prix
                  de réserve : <strong>{formatPrice(outcome.reserve)}</strong>
                  {" "}(écart {formatPrice(outcome.reserve - outcome.topBid)})
                </div>
                <div className="mt-1 text-xs">
                  Délai : <Countdown deadline={outcome.deadline} />
                </div>
              </>
            }
            action={
              <div className="flex gap-2">
                <Button
                  size="md"
                  variant="danger"
                  onClick={() => setDecisionOpen("reject")}
                >
                  Refuser
                </Button>
                <Button size="md" onClick={() => setDecisionOpen("accept")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Accepter l&apos;offre
                </Button>
              </div>
            }
          />
        );

      case "seller_decision_top_bidder":
        return (
          <Banner
            tone="amber"
            icon={<Hourglass className="h-7 w-7" />}
            title="Votre offre est en cours d'examen"
            body={
              <>
                Enchère terminée au prix de <strong>{formatPrice(outcome.topBid)}</strong>, sans atteindre
                le prix de réserve ({formatPrice(outcome.reserve)}). Le vendeur a jusqu&apos;au{" "}
                <Countdown deadline={outcome.deadline} /> pour décider d&apos;accepter votre offre. Vous serez notifié dès la décision.
              </>
            }
          />
        );

      case "seller_decision_other":
        // Unrelated bidders see nothing — handled by the early return above.
        return null;

      default:
        return null;
    }
  }
}

function Banner({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: "gold" | "amber" | "muted";
  icon: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  const cls =
    tone === "gold"
      ? "bg-gradient-to-br from-[var(--gold-faint)] via-[var(--surface)] to-[var(--surface)] border-[var(--gold)]/40"
      : tone === "amber"
        ? "bg-amber-500/10 border-amber-500/40"
        : "bg-[var(--surface)] border-[var(--border)]";
  const iconCls =
    tone === "gold"
      ? "bg-[var(--gold)] text-black"
      : tone === "amber"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-[var(--surface-2)] text-[var(--foreground-muted)]";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
        cls,
      )}
    >
      <div
        className={cn(
          "h-12 w-12 rounded-full flex items-center justify-center shrink-0",
          iconCls,
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold">{title}</div>
        <div className="text-sm text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
          {body}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * One-shot popup for the top bidder when the seller hasn't yet decided
 * whether to accept their below-reserve offer. Pops on first entry per
 * session per auction (sessionStorage flag), so they're informed loud
 * and clear without it nagging on every refresh.
 */
function WinnerPopup({
  auction,
  outcome,
}: {
  auction: Auction;
  outcome: { kind: "seller_decision_top_bidder"; topBid: number; reserve: number; deadline: Date };
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `mazed_winner_popup_${auction.id}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — pop anyway
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [auction.id]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Votre offre est en cours d'examen"
      description="Le vendeur a quelques jours pour décider"
    >
      <div className="space-y-3 text-sm text-[var(--foreground-muted)] leading-relaxed">
        <p>
          L&apos;enchère pour <strong className="text-foreground">
            {auction.vehicle.make} {auction.vehicle.model} {auction.vehicle.year}
          </strong>{" "}
          s&apos;est terminée à <strong className="text-foreground tabular-nums">{formatPrice(outcome.topBid)}</strong>{" "}
          — sous le prix de réserve ({formatPrice(outcome.reserve)}).
        </p>
        <p>
          Le vendeur a jusqu&apos;à <Countdown deadline={outcome.deadline} /> pour
          accepter ou refuser votre offre. Vous serez notifié dès la décision.
        </p>
        <p className="text-[12px] text-[var(--foreground-subtle)] pt-1">
          Votre caution reste bloquée jusqu&apos;à la décision. En cas de
          refus, elle sera intégralement remboursée sous 24 heures.
        </p>
      </div>
      <ModalFooter>
        <Button size="md" onClick={() => setOpen(false)}>
          Compris
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function Countdown({ deadline }: { deadline: Date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // eslint-disable-next-line react-hooks/purity
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0)
    return <span className="text-[var(--danger)] font-bold">Délai dépassé</span>;
  const hr = Math.floor(ms / 3600_000);
  if (hr >= 24) {
    const days = Math.floor(hr / 24);
    return (
      <span className="font-bold tabular-nums">
        {days} {days === 1 ? "jour" : "jours"} {hr % 24} h
      </span>
    );
  }
  const min = Math.floor((ms % 3600_000) / 60_000);
  return (
    <span className="font-bold tabular-nums">
      <AlertTriangle className="h-3 w-3 inline" /> {hr}h {min}min
    </span>
  );
}
