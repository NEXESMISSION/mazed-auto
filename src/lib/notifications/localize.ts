/**
 * A notification in the reader's language.
 *
 * Notifications are stored as finished French text: the database triggers and
 * the API routes that enqueue them write `title` and `body` in French. French
 * readers get exactly that. For an Arabic reader, a kind we know is re-worded
 * from the `notifications.kinds.<kind>` messages, with the two things that
 * vary taken back out of the stored French: the annonce's title (always quoted
 * « … ») and an admin's reason (after « Motif : »). Admin broadcasts
 * (announcement, promo…) are typed by a person and stay as written, and so does
 * any kind or any body we cannot read the pieces out of — the stored French
 * beats an Arabic sentence with a hole in it.
 */

type Translator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
  raw(key: string): unknown;
};

export type StoredNotification = { kind: string; title: string; body: string | null };

const QUOTED = /«\s*([^»]+?)\s*»/;
// French sentences that follow an admin's reason in the stored bodies.
const AFTER_REASON =
  /\s*(?:\.\s*)?(?:Vous pouvez[\s\S]*|Votre publication vous a été rendue\.?|Contactez-nous[\s\S]*|Envoyez-en[\s\S]*)$/;

export function listingTitleOf(body: string | null): string | null {
  return body?.match(QUOTED)?.[1] ?? null;
}

export function reasonOf(body: string | null): string | null {
  const m = body?.match(/Motif\s*:\s*([\s\S]+)$/);
  if (!m) return null;
  const reason = m[1].replace(AFTER_REASON, "").replace(/\.\s*$/, "").trim();
  return reason || null;
}

export function localizeNotification(
  n: StoredNotification,
  locale: string,
  t: Translator,
): { title: string; body: string | null } {
  const stored = { title: n.title, body: n.body };
  if (locale !== "ar" || !t.has(`kinds.${n.kind}.title`)) return stored;

  const title = t(`kinds.${n.kind}.title`);
  const template = String(t.raw(`kinds.${n.kind}.body`) ?? "");
  const values: Record<string, string> = {};
  if (template.includes("{listing}")) {
    const listing = listingTitleOf(n.body);
    if (!listing) return { title, body: n.body };
    values.listing = listing;
  }
  if (template.includes("{reason}")) {
    const reason = reasonOf(n.body);
    if (!reason) return { title, body: n.body };
    values.reason = reason;
  }
  let body = t(`kinds.${n.kind}.body`, values);
  if (n.kind === "listing_rejected" && n.body?.includes("Votre publication vous a été rendue")) {
    body += ` ${t("kinds.listing_rejected.returned")}`;
  }
  return { title, body };
}

/**
 * « il y a 5 min » — the compact scale the bell and the notifications page
 * share; past a week, the date.
 */
export function compactTimeAgo(
  iso: string,
  t: (key: string, values?: Record<string, number>) => string,
  formatDay: (d: Date) => string,
  now: number = Date.now(),
): string {
  const s = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("time.now");
  const m = Math.floor(s / 60);
  if (m < 60) return t("time.minutes", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hours", { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("time.days", { count: d });
  try {
    return formatDay(new Date(iso));
  } catch {
    return iso;
  }
}
