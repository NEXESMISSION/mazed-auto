"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

interface Props {
  sellerId: string;
  sellerName: string;
}

export function RateSellerButton({ sellerId, sellerName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  // null = still checking; false = not eligible (no completed purchase from
  // this seller); true = eligible. Mirrors the SQL trigger that enforces the
  // same rule, but lets us hide the button entirely when ineligible.
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setEligible(false);
      return;
    }
    const supabase = createClient();

    // Fetch this seller's auction ids, then check if the user has a completed
    // final_payment against any of them.
    (async () => {
      const { data: auctions } = await supabase
        .from("auctions")
        .select("id")
        .eq("seller_id", sellerId);
      const auctionIds = (auctions ?? []).map((a) => a.id);
      if (auctionIds.length === 0) {
        setEligible(false);
        return;
      }
      const { data: paid } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .in("auction_id", auctionIds)
        .eq("type", "final_payment")
        .eq("status", "completed")
        .limit(1);
      setEligible((paid ?? []).length > 0);
    })();

    supabase
      .from("seller_ratings")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("buyer_label", makeLabel(user.firstName, user.lastName, user.email))
      .limit(1)
      .then(({ data }) => setAlreadyRated((data ?? []).length > 0));
  }, [user, sellerId]);

  async function submit() {
    if (!user) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("seller_ratings").insert({
      seller_id: sellerId,
      buyer_label: makeLabel(user.firstName, user.lastName, user.email),
      rating,
      comment: comment || null,
    });
    setBusy(false);
    if (error) {
      const msg = error.message.includes("NO_COMPLETED_PURCHASE")
        ? "Vous devez avoir finalisé au moins un achat auprès de ce vendeur avant de l'évaluer"
        : "Échec d'envoi de l'évaluation : " + error.message;
      toast(msg, "error");
      return;
    }
    setAlreadyRated(true);
    setOpen(false);
    toast("Merci pour votre évaluation", "success");
  }

  // Hide entirely if the user hasn't bought from this seller. The SQL trigger
  // would reject anyway, but showing a button that always errors is bad UX.
  if (eligible === false) return null;
  if (eligible === null) return null; // still checking

  if (alreadyRated) {
    return (
      <Button size="sm" variant="ghost" disabled>
        <Star className="h-3.5 w-3.5 fill-current text-[var(--gold)]" />
Évalué
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Star className="h-3.5 w-3.5" />
Évaluer le vendeur
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Évaluer ${sellerName}`}
        description="Votre évaluation aide les autres acheteurs"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`${n} étoiles`}
              >
                <Star
                  className={`h-9 w-9 ${
                    n <= rating
                      ? "fill-[var(--gold)] text-[var(--gold)]"
                      : "text-[var(--border-strong)]"
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Commentaire (optionnel)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Comment s'est passée votre expérience ?"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm placeholder:text-[var(--foreground-subtle)] focus:border-[var(--gold)] focus:outline-none resize-none"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submit} disabled={busy}>
            {busy ? "Envoi en cours..." : "Envoyer l'évaluation"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function makeLabel(
  firstName?: string,
  lastName?: string,
  email?: string,
): string {
  const f = firstName?.trim();
  const l = lastName?.trim();
  if (f && l) return `${f} ${l[0]}.`;
  if (f) return f;
  return email?.split("@")[0] || "Acheteur";
}
