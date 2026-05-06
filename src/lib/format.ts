export function formatPrice(amount: number, currency: string = "DT"): string {
  return new Intl.NumberFormat("fr-TN", {
    maximumFractionDigits: 0,
  }).format(amount) + " " + currency;
}

export function formatPriceShort(amount: number): string {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + "K";
  return amount.toString();
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("fr-TN").format(n);
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
