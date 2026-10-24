import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a TND amount with locale-correct grouping. The plan caps prices in
 * the millions, so we never need decimals — properties trade in whole dinars.
 *
 * Arabic pages group the same way as French ones (« 45 000 »), in Western
 * digits. ar-TN would write « 45.000 », and in Tunisia a dot before three
 * digits reads as millimes: 45 dinars, not 45 000. The grouping space is a
 * narrow no-break space, which keeps the number in one piece inside Arabic text.
 */
export function formatTND(
  amount: number,
  locale: string = "fr-TN",
  options: { compact?: boolean } = {},
) {
  const localeTag = locale === "en" ? "en-US" : "fr-TN";
  return new Intl.NumberFormat(localeTag, {
    style: "decimal",
    maximumFractionDigits: 0,
    notation: options.compact ? "compact" : "standard",
  }).format(amount);
}

/** The dinar's symbol beside a price: « TND » in French, « د.ت » in Arabic. */
export function currencyLabel(locale: string): string {
  return locale === "ar" ? "د.ت" : "TND";
}

/**
 * Bid increment ladder from the plan §8 (in TND):
 *   <100k          → 1,000
 *   100k–500k      → 5,000
 *   500k–1M        → 10,000
 *   ≥1M            → 25,000
 */
export function minBidIncrement(currentBid: number): number {
  if (currentBid < 100_000) return 1_000;
  if (currentBid < 500_000) return 5_000;
  if (currentBid < 1_000_000) return 10_000;
  return 25_000;
}
