/**
 * Map next-intl bare locale codes (`fr`, `ar`) to BCP-47 tags with a
 * region. Without the region, Intl falls back to language-only defaults
 * which differ subtly: Arabic without a region prints Eastern Arabic
 * numerals (٠١٢٣…) which look right in MSA text, but the Tunisian
 * regional variant (`ar-TN`) prints Western Arabic numerals (0123…) —
 * matching what users see on banknotes, fuel pumps, and government
 * forms. Pinning the region avoids the digit-system mismatch.
 */
function resolveLocaleTag(locale: string | undefined): string {
  if (!locale) return "fr-TN";
  if (locale === "ar") return "ar-TN";
  if (locale === "fr") return "fr-TN";
  return locale;
}

/**
 * Format a price in DT. Defaults to "fr-TN" for backwards compatibility
 * with the dozens of call sites that don't yet pass a locale — but new
 * call sites in pages with `useLocale()` should pass the active locale
 * so Arabic users see the Arabic thousand-separator (٬ instead of the
 * narrow no-break space) and digits group correctly per their script.
 */
export function formatPrice(
  amount: number,
  currency: string = "DT",
  locale?: string,
): string {
  return (
    new Intl.NumberFormat(resolveLocaleTag(locale), {
      maximumFractionDigits: 0,
    }).format(amount) +
    " " +
    currency
  );
}

export function formatPriceShort(amount: number): string {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + "K";
  return amount.toString();
}

export function formatNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(resolveLocaleTag(locale)).format(n);
}

/**
 * Returns time remaining as { days, hours, minutes, seconds, isEnded }
 */
export function timeRemaining(endTime: Date | string | number) {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, totalMs: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isEnded: false, totalMs: diff };
}

export function formatTimeRemaining(endTime: Date | string | number): string {
  const t = timeRemaining(endTime);
  if (t.isEnded) return "Terminé";
  if (t.days > 0) return `${t.days}j ${t.hours}h`;
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`;
  if (t.minutes > 0) return `${t.minutes}m ${t.seconds}s`;
  return `${t.seconds}s`;
}

export function isEndingSoon(endTime: Date | string | number): boolean {
  const t = timeRemaining(endTime);
  return !t.isEnded && t.totalMs < 60 * 60 * 1000; // < 1 hour
}

/**
 * Public-facing tracking code for an auction. Derived from the first 6
 * hex chars of the UUID so it stays stable for the lifetime of the row
 * and never needs a separate DB column. Buyers and sellers reference it
 * in support tickets, screenshots, and shared links.
 */
export function auctionCode(id: string): string {
  const hex = (id || "").replace(/[^a-fA-F0-9]/g, "").slice(0, 6).toUpperCase();
  return `MA-${hex.padEnd(6, "0")}`;
}

/**
 * Locale-aware date/time formatter. Defaults to French (Tunisia) so
 * existing call sites that don't pass a locale keep their current
 * output, but pages can opt in with the active locale from
 * useLocale() / getLocale() and Arabic users see Arabic numerals +
 * date order instead of the legacy "fr-TN" / "fr-FR" hard-codings.
 */
export function formatDateTime(
  d: Date | string | number,
  locale: string = "fr-TN",
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(d).toLocaleString(resolveLocaleTag(locale), options);
}
