"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { Phone, MessageCircle, Loader2 } from "lucide-react";

/**
 * "Afficher le numéro".
 *
 * The number is not in this page's HTML — it cannot be, because `contact_phone`
 * is granted to service_role alone (0154). It arrives only when a person asks
 * for it, and that ask is logged and rate-limited server-side. A scraper that
 * fetches a thousand listing pages gets a thousand pages with no phone numbers
 * in them; to collect numbers it has to make a thousand deliberate requests
 * from one address, which is exactly the pattern the log catches.
 *
 * Its words are in `shared` (global): the shop storefronts use it too.
 */
export function ContactReveal({
  listingId,
  endpoint,
  trackWhatsApp,
}: {
  listingId?: string;
  /** Where to ask. Defaults to the annonce's route; a shop passes its own. */
  endpoint?: string;
  /** A shop counts WhatsApp taps for its statistics (0193): where to say so.
   *  A beacon, so it never holds the link up. */
  trackWhatsApp?: string;
}) {
  const { toast } = useToast();
  const t = useTranslations("shared.contact");
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ phone: string | null; whatsapp: string | null } | null>(null);

  async function reveal() {
    setBusy(true);
    try {
      const res = await fetch(endpoint ?? `/api/annonces/${listingId}/contact`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? t("unavailable"), res.status === 429 ? "warning" : "error");
        return;
      }
      setContact({ phone: j.phone ?? null, whatsapp: j.whatsapp ?? null });
    } catch {
      toast(t("network"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (contact) {
    const wa = (contact.whatsapp ?? contact.phone ?? "").replace(/\D/g, "");
    return (
      <div className="space-y-2">
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="batta-btn-luxe tap-target flex w-full items-center justify-center gap-2 px-5 py-3.5 text-[15px]"
          >
            <Phone className="size-4" strokeWidth={2.5} />
            <span className="batta-tabular ltr-island">{contact.phone}</span>
          </a>
        )}
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            if (!trackWhatsApp) return;
            try {
              navigator.sendBeacon(trackWhatsApp, new Blob([JSON.stringify({ kind: "whatsapp_click" })], { type: "text/plain" }));
            } catch {
              /* a missed count is not the visitor's problem */
            }
          }}
          className="tap-target flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-3 text-[13.5px] font-bold text-foreground transition hover:border-gold-soft"
        >
          <MessageCircle className="size-4" strokeWidth={2.2} />
          WhatsApp
        </a>
        <p className="text-center text-[11px] text-muted">
          {t("disclaimer")}
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
        {t("show")}
      </button>
    </div>
  );
}
