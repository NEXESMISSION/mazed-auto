/**
 * Dates and times in the reader's language. Arabic uses the Tunisian forms
 * (« جانفي، فيفري… », the months as written in Tunisia) and Western digits,
 * the digits Tunisians read prices, plates and phone numbers in.
 */

/** The Intl locale tag for a site locale. */
export function intlLocale(locale: string): string {
  return locale === "ar" ? "ar-TN-u-nu-latn" : "fr-TN";
}

type DateInput = string | number | Date;

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** « 24 octobre 2026 » / « 24 أكتوبر 2026 », or what `options` asks for. */
export function formatDate(
  date: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Africa/Tunis", ...options }).format(toDate(date));
}

/** Date and time, short: « 24 oct. 2026, 14:05 ». */
export function formatDateTime(date: DateInput, locale: string): string {
  // h23 spelled out: « fr-TN » defaults to a 12-hour clock (« 09:01 AM »).
  return formatDate(date, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** « il y a 3 heures » / « منذ 3 ساعات », from the largest unit that fits. */
export function timeAgo(date: DateInput, locale: string, now: number = Date.now()): string {
  const seconds = Math.round((toDate(date).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}
