"use client";

import { useEffect, useState, Suspense } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Smartphone,
  Building2,
  Lock,
  ArrowRight,
  ChevronLeft,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

function CheckoutContent() {
  const router = useRouter();
  const params = useSearchParams();
  // Parse the amount strictly. Previously this defaulted to 1600 DT
  // when the param was missing — meaning a malformed link could
  // silently charge the buyer the wrong amount. Now we reject any
  // missing / non-numeric / non-positive value below.
  const rawAmount = params.get("amount");
  const parsedAmount = rawAmount === null ? NaN : Number(rawAmount);
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const type = params.get("type") ?? "deposit";
  const auctionId = params.get("auction");

  const [method, setMethod] = useState<"card" | "d17" | "bank">("card");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [block, setBlock] = useState<{ title: string; body: string } | null>(
    null,
  );
  // Initial value is computed lazily so we don't have to flip the
  // flag in an effect for cases where there's nothing to validate.
  const [validating, setValidating] = useState(() => {
    if (amount <= 0) return false;
    if (type === "subscription") return false;
    if (!auctionId) return false;
    return true;
  });

  // Hard-gate on the amount being a real positive number BEFORE we
  // even hit Supabase. Without this a malformed link like
  // /payment/checkout?type=deposit&auction=xyz (no amount) would have
  // silently used the old default of 1600 DT.
  useEffect(() => {
    if (amount <= 0) {
      setBlock({
        title: "Montant manquant ou invalide",
        body: "Le lien de paiement est incomplet. Revenez à l'enchère et réessayez.",
      });
      setValidating(false);
    }
  }, [amount]);

  // Validate that the auction is in a state that accepts this payment type.
  // Spec: deposits only on live auctions, final payments only on ended /
  // pending_seller_decision (or live if it's a buy-now). Refuse anything else
  // up-front so we never charge a card against a dead auction.
  //
  // Subscription payments and amount-less / auction-less cases short-circuit
  // here — their `validating` state is already `false` from the lazy init.
  useEffect(() => {
    if (amount <= 0) return;
    if (type === "subscription") return;
    if (!auctionId) return;
    const supabase = createClient();
    supabase
      .from("auctions")
      .select("status")
      .eq("id", auctionId)
      .maybeSingle()
      .then(({ data }) => {
        const status = data?.status as string | undefined;
        if (!status) {
          setBlock({
            title: "Enchère introuvable",
            body: "Vérifiez le lien ou revenez à la liste des enchères.",
          });
        } else if (
          type === "deposit" &&
          status !== "active" &&
          status !== "ending"
        ) {
          setBlock({
            title: "Impossible de payer la caution maintenant",
            body:
              status === "ended" || status === "reserve_not_met"
                ? "Cette enchère est terminée. Aucune caution n'est requise."
                : "Cette enchère n'accepte pas de caution actuellement.",
          });
        } else if (
          type === "final" &&
          status !== "active" &&
          status !== "ending" &&
          status !== "ended" &&
          status !== "pending_seller_decision"
        ) {
          setBlock({
            title: "Impossible de finaliser le paiement",
            body:
              status === "cancelled"
                ? "Cette enchère a été annulée — aucune voiture à payer."
                : "Le statut de l'enchère ne permet pas de paiement final actuellement.",
          });
        }
        setValidating(false);
      });
  }, [auctionId, type]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (block) return;
    const url = new URL(window.location.origin + "/payment/processing");
    params.forEach((v, k) => url.searchParams.set(k, v));
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("type", type);
    url.searchParams.set("method", method);
    router.push(url.pathname + url.search);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header — slim sticky bar, scales up on desktop */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-md lg:max-w-[var(--max-w-content)] mx-auto px-4 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
            aria-label="Retour"
          >
            <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2 font-bold text-sm lg:text-base">
            <Lock className="h-4 w-4 lg:h-4.5 lg:w-4.5 text-[var(--gold)]" />
            Paiement sécurisé
          </div>
          <div className="w-9 lg:w-10" />
        </div>
      </header>

      <main className="flex-1 max-w-md lg:max-w-[var(--max-w-content)] mx-auto w-full p-4 lg:px-8 lg:py-10 pb-32 md:pb-4 space-y-4 lg:space-y-6">
        {block ? (
          <div className="rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/40 p-5 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
            <div className="font-bold">{block.title}</div>
            <p className="text-sm text-[var(--foreground-muted)]">{block.body}</p>
            {auctionId && (
              <Link href={`/auctions/${auctionId}`} className="block">
                <Button variant="secondary" size="md" fullWidth>
Voir l'enchère
                </Button>
              </Link>
            )}
          </div>
        ) : validating ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
        {/* Mock notice */}
        <Badge variant="warning" size="md" className="w-fit">
⚠ Paiement simulé à des fins de test
        </Badge>

        {/* Summary — bigger, more confident on desktop */}
        <div className="relative overflow-hidden rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] lg:ring-1 lg:ring-[var(--gold)]/20 lg:border-0 p-4 lg:p-7">
          <div
            aria-hidden
            className="hidden lg:block pointer-events-none absolute -top-20 -end-20 h-56 w-56 rounded-full bg-[var(--gold)] blur-3xl opacity-15"
          />
          <div className="relative">
            <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.18em] lg:tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
              {type === "deposit"
                ? "Caution de participation (5%)"
                : type === "final"
                  ? "Prix final de la voiture"
                  : type === "subscription"
                    ? params.get("plan_label") || "Abonnement Mazed Auto"
                    : "Montant"}
            </div>
            {type === "subscription" && (
              <div className="text-xs text-[var(--foreground-muted)] mt-1.5 lg:mt-2">
                Renouvelable tous les 30 jours · annulable à tout moment
              </div>
            )}
            <div className="mt-1.5 lg:mt-3 text-3xl lg:text-[48px] xl:text-[56px] font-extrabold lg:font-black gradient-gold-text tabular-nums leading-none">
              {formatPrice(amount)}
            </div>
          </div>
        </div>

        {/* Method tabs */}
        <div>
          <div className="text-xs font-semibold text-[var(--foreground-muted)] mb-2">
Choisir le moyen de paiement
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MethodTab
              active={method === "card"}
              onClick={() => setMethod("card")}
              icon={<CreditCard className="h-5 w-5" />}
              label="Carte"
            />
            <MethodTab
              active={method === "d17"}
              onClick={() => setMethod("d17")}
              icon={<Smartphone className="h-5 w-5" />}
              label="D17"
            />
            <MethodTab
              active={method === "bank"}
              onClick={() => setMethod("bank")}
              icon={<Building2 className="h-5 w-5" />}
              label="Virement"
            />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {method === "card" && (
            <>
              <Field label="Numéro de carte">
                <Input
                  placeholder="4242 4242 4242 4242"
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value })}
                  inputMode="numeric"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date d'expiration">
                  <Input
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                  />
                </Field>
                <Field label="CVV">
                  <Input
                    placeholder="123"
                    value={card.cvv}
                    onChange={(e) => setCard({ ...card, cvv: e.target.value })}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <Field label="Nom du titulaire">
                <Input
                  placeholder="MOHAMED BEN ALI"
                  value={card.name}
                  onChange={(e) => setCard({ ...card, name: e.target.value })}
                />
              </Field>
            </>
          )}

          {method === "d17" && (
            <Field label="Numéro de téléphone enregistré sur D17">
              <Input placeholder="20 123 456" inputMode="tel" />
            </Field>
          )}

          {method === "bank" && (
            <Field label="Numéro RIB">
              <Input placeholder="20 010 000 1234567890 12" />
            </Field>
          )}

          <Button type="submit" size="xl" fullWidth>
            <Lock className="h-5 w-5" />
            Payer {formatPrice(amount)}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </form>

        <div className="text-center text-xs text-[var(--foreground-muted)] flex items-center justify-center gap-1.5">
          <Lock className="h-3 w-3" />
Transaction chiffrée par SSL
        </div>

        <Link
          href="/help"
          className="block text-center text-xs text-[var(--gold)] hover:underline"
        >
Vous rencontrez un problème ?
        </Link>
          </>
        )}
      </main>
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-[var(--radius)] border-2 flex flex-col items-center gap-1 transition-colors ${
        active
          ? "bg-[var(--gold-faint)] border-[var(--gold)] text-[var(--gold)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:border-[var(--gold-soft)]"
      }`}
    >
      {icon}
      <span className="text-xs font-bold">{label}</span>
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

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-3 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
