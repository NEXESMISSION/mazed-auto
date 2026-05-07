"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Minus, Plus, Gavel, Zap, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Countdown } from "./Countdown";
import { AIAlerts } from "./AIAlerts";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
}

export function BidBox({ auction }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const minBid = auction.currentPrice + auction.bidIncrement;
  const [amount, setAmount] = useState(minBid);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const [autoMax, setAutoMax] = useState(minBid * 2);

  const dec = () => setAmount((v) => Math.max(minBid, v - auction.bidIncrement));
  const inc = () => setAmount((v) => v + auction.bidIncrement);

  const isAtMin = amount <= minBid;
  const hasAlerts = auction.alerts && auction.alerts.length > 0;

  function handleBidClick() {
    if (hasAlerts) {
      setShowAlerts(true);
    } else {
      setShowConfirm(true);
    }
  }

  function proceedAfterAlerts() {
    setShowAlerts(false);
    setShowConfirm(true);
  }

  function placeBid() {
    setShowConfirm(false);
    // Mock: simulate need to pay deposit first
    const url = `/payment/checkout?type=deposit&amount=${auction.participationDeposit}&auction=${auction.id}`;
    router.push(url);
  }

  return (
    <>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        {/* Live badge + countdown */}
        <div className="px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--gold)] pulse-gold" />
            <span className="text-xs font-semibold text-[var(--gold)]">
              Enchère En direct
            </span>
          </div>
          <button
            onClick={() => setShowRules(true)}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors flex items-center gap-1"
          >
            Règles
            <Info className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex justify-center mb-4">
            <Countdown endTime={auction.endTime} size="md" />
          </div>

          <div className="text-center mb-4">
            <div className="text-xs text-[var(--foreground-muted)] mb-1">
              Prix actuel
            </div>
            <div className="text-3xl font-extrabold gradient-gold-text tabular-nums">
              {formatPrice(auction.currentPrice)}
            </div>
            <div className="text-xs text-[var(--foreground-muted)] mt-1">
              {auction.totalBids} {auction.totalBids === 1 ? "offre" : "offres"} • {auction.totalParticipants} {auction.totalParticipants === 1 ? "participant" : "participants"}
            </div>
          </div>

          {auction.reservePrice && (
            <div className="mb-4 p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-xs flex items-center justify-between">
              <span className="text-[var(--foreground-muted)]">Prix de réserve</span>
              <span
                className={`font-bold ${
                  auction.reserveMet ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {auction.reserveMet ? "✓ Atteint" : "Non atteint"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
              Votre offre (minimum : {formatPrice(minBid)})
            </label>
            <div className="flex items-stretch h-12 rounded-[var(--radius)] overflow-hidden border border-[var(--border)] focus-within:border-[var(--gold)]">
              <button
                onClick={dec}
                disabled={isAtMin}
                className="px-4 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                aria-label="Réduire"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || minBid)}
                className="flex-1 bg-[var(--surface)] text-center text-lg font-bold tabular-nums focus:outline-none"
              />
              <button
                onClick={inc}
                className="px-4 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors flex items-center justify-center"
                aria-label="Incrément"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Button size="lg" fullWidth onClick={handleBidClick}>
              <Gavel className="h-5 w-5" />
              Enchérir à {formatPrice(amount)}
            </Button>

            {auction.buyNowPrice && (
              <Button
                size="lg"
                variant="outline"
                fullWidth
                onClick={() => {
                  toast("Redirection vers le paiement immédiat", "info");
                  router.push(
                    `/payment/checkout?type=final&amount=${auction.buyNowPrice}&auction=${auction.id}`,
                  );
                }}
              >
                <Zap className="h-5 w-5" />
                Achat immédiat à {formatPrice(auction.buyNowPrice)}
              </Button>
            )}

            <Button
              size="md"
              variant="ghost"
              fullWidth
              onClick={() => setShowAuto(true)}
            >
              Activer l'auto-enchère
            </Button>
          </div>

          <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/30 flex gap-2 items-start">
            <Info className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold text-[var(--gold-bright)]">Caution de participation:</span>{" "}
              <span className="text-[var(--foreground-muted)]">
                {formatPrice(auction.participationDeposit)} (5%, remboursée si vous ne gagnez pas)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Alert Modal */}
      <Modal
        open={showAlerts}
        onClose={() => setShowAlerts(false)}
        title="Informations importantes sur cette enchère"
        description="Nous souhaitons vous alerter avant de continuer"
      >
        {hasAlerts && <AIAlerts alerts={auction.alerts!} />}
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setShowAlerts(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={proceedAfterAlerts}>
            <CheckCircle2 className="h-4 w-4" />
Compris, continuer
          </Button>
        </ModalFooter>
      </Modal>

      {/* Bid Confirmation Modal */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmer l'offre"
        description="Vérifiez les détails avant l'envoi"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius)] bg-[var(--surface-2)] p-3 space-y-2 text-sm">
            <Row k="Prix actuel" v={formatPrice(auction.currentPrice)} />
            <Row k="votre offre" v={formatPrice(amount)} highlight />
            <div className="border-t border-[var(--border)] my-2" />
            <Row
              k="Caution de participation (5%)"
              v={formatPrice(auction.participationDeposit)}
              hint="Payée une fois, remboursée si vous ne gagnez pas"
            />
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            En cliquant sur &ldquo;Confirmer&rdquo;, vous serez redirigé vers la page de paiement pour déposer la
            caution de participation. Après le paiement, votre offre sera enregistrée automatiquement.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setShowConfirm(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={placeBid}>
            <Gavel className="h-4 w-4" />
Confirmer et payer
          </Button>
        </ModalFooter>
      </Modal>

      {/* Rules Modal */}
      <Modal
        open={showRules}
        onClose={() => setShowRules(false)}
        title="Règles de l'enchère"
      >
        <ul className="space-y-3 text-sm text-[var(--foreground-muted)] leading-relaxed">
          <li>• <strong className="text-foreground">Caution 5%:</strong> Payée une fois par enchère, remboursée si vous ne gagnez pas.</li>
          <li>• <strong className="text-foreground">Anti-Sniping:</strong> Toute offre dans les 5 dernières minutes prolonge l'enchère de 5 minutes.</li>
          <li>• <strong className="text-foreground">Réserve :</strong> Si le prix de réserve n'est pas atteint, l'enchère n'est pas conclue.</li>
          <li>• <strong className="text-foreground">Auto-enchère :</strong> Enchérit en votre nom jusqu'au maximum.</li>
          <li>• <strong className="text-foreground">Retrait après victoire :</strong> Caution saisie + bannissement 30 jours.</li>
        </ul>
      </Modal>

      {/* Auto-Bid Modal */}
      <Modal
        open={showAuto}
        onClose={() => setShowAuto(false)}
        title="Configurer l'auto-enchère"
        description="Nous enchérissons en votre nom jusqu'au maximum"
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold text-[var(--foreground-muted)]">
            Maximum que vous souhaitez atteindre
          </label>
          <div className="flex items-stretch h-12 rounded-[var(--radius)] overflow-hidden border border-[var(--border)]">
            <input
              type="number"
              value={autoMax}
              onChange={(e) => setAutoMax(Number(e.target.value))}
              min={minBid}
              step={auction.bidIncrement}
              className="flex-1 bg-[var(--surface)] text-center text-lg font-bold tabular-nums px-4 focus:outline-none"
            />
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            À chaque nouvelle offre, nous proposons une contre-offre avec l'incrément minimum, jusqu'à ce que
            votre offre maximum de {formatPrice(autoMax)} soit atteinte.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setShowAuto(false)}>
            Annuler
          </Button>
          <Button
            size="md"
            onClick={() => {
              setShowAuto(false);
              toast(`✓ Auto-enchère activée jusqu'à ${formatPrice(autoMax)}`, "success");
            }}
          >
            Activer
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function Row({
  k,
  v,
  hint,
  highlight,
}: {
  k: string;
  v: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <div>
        <div className="text-[var(--foreground-muted)]">{k}</div>
        {hint && (
          <div className="text-[10px] text-[var(--foreground-subtle)]">
            {hint}
          </div>
        )}
      </div>
      <div
        className={`font-bold tabular-nums ${highlight ? "text-[var(--gold)] text-base" : ""}`}
      >
        {v}
      </div>
    </div>
  );
}
