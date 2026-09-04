"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Phone, MessageCircle, Loader2, Eye } from "lucide-react";

/**
 * "Afficher le numéro".
 *
 * The number is not in this page's HTML — it cannot be, because `contact_phone`
 * is granted to service_role alone (0154). It arrives only when a person asks
 * for it, and that ask is logged and rate-limited server-side. A scraper that
 * fetches a thousand listing pages gets a thousand pages with no phone numbers
 * in them; to collect numbers it has to make a thousand deliberate requests
 * from one address, which is exactly the pattern the log catches.
 */
export function ContactReveal({
  listingId,
  revealCount,
}: {
  listingId: string;
  revealCount: number;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ phone: string; whatsapp: string | null } | null>(null);

  async function reveal() {
    setBusy(true);
    try {
      const res = await fetch(`/api/annonces/${listingId}/contact`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? "Numéro indisponible.", res.status === 429 ? "warning" : "error");
        return;
      }
      setContact({ phone: j.phone, whatsapp: j.whatsapp ?? null });
    } catch {
      toast("Erreur réseau.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (contact) {
    const wa = (contact.whatsapp ?? contact.phone).replace(/\D/g, "");
    return (
      <div className="space-y-2">
        <a
          href={`tel:${contact.phone}`}
          className="batta-btn-luxe tap-target flex w-full items-center justify-center gap-2 px-5 py-3.5 text-[15px]"
        >
          <Phone className="size-4" strokeWidth={2.5} />
          <span className="batta-tabular">{contact.phone}</span>
        </a>
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noreferrer"
          className="tap-target flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-3 text-[13.5px] font-bold text-foreground transition hover:border-gold-soft"
        >
          <MessageCircle className="size-4" strokeWidth={2.2} />
          WhatsApp
        </a>
        <p className="text-center text-[11px] text-muted">
          Mazed met en relation, sans intervenir dans la vente. Vérifiez le véhicule et les
          papiers avant tout paiement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        className="batta-btn-luxe tap-target flex w-full items-center justify-center gap-2 px-5 py-3.5 text-[15px] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" strokeWidth={2.5} />}
        Afficher le numéro
      </button>
      {/* The seller's name is printed above this button, so it is not
          repeated here — this line carries the one thing the button does not
          say: other people are already asking.

          Written as a single string rather than as JSX text around
          expressions. It used to sit inside an `inline-flex` span, where
          flexbox drops the whitespace between the runs and it rendered as
          "2 personnesl'ont demandé". */}
      {revealCount > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
          <Eye className="size-3.5 shrink-0" />
          <span>
            {`${revealCount} personne${revealCount > 1 ? "s" : ""} ${
              revealCount > 1 ? "l'ont" : "l'a"
            } demandé`}
          </span>
        </p>
      )}
    </div>
  );
}
