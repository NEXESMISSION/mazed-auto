"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { routing } from "@/i18n/routing";

/**
 * Hands off to the return URL after a short delay so the user reads
 * "Paiement confirmé" before the page changes. The /payment/success
 * server component renders the human-facing card; this client widget
 * only handles the navigation timing.
 */
export function SuccessAutoRedirect({
  to,
  delayMs = 1800,
  enabled = true,
}: {
  to: string;
  delayMs?: number;
  enabled?: boolean;
}) {
  const locale = useLocale();
  useEffect(() => {
    if (!enabled) return;
    // `to` is a path without its locale (it is also handed to the i18n Link).
    // A bare "/account/listings" would be sent to the visitor's cookie
    // language, French when they have none — not the page they are reading.
    const prefixed = routing.locales.some((l) => to === `/${l}` || to.startsWith(`/${l}/`))
      ? to
      : `/${locale}${to === "/" ? "" : to}`;
    const t = setTimeout(() => {
      window.location.href = prefixed;
    }, delayMs);
    return () => clearTimeout(t);
  }, [to, delayMs, enabled, locale]);
  return null;
}
