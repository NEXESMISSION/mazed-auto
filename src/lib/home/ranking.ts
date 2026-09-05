/**
 * What gets seen, and in what order.
 *
 * Every surface on the home page used `order by published_at desc` and nothing
 * else, which produced two problems at once:
 *
 *   • The page was identical on every visit. Not "stable" — identical, byte for
 *     byte, until somebody published. A visitor who came back an hour later saw
 *     the same six cars in the same six places, so there was never a reason to
 *     look twice.
 *
 *   • The same listings filled every surface. The cover, the runners, the
 *     marquee and both rails all drew from one pool in one order, so the newest
 *     car appeared three or four times on a single screen while the ninetieth
 *     appeared nowhere. A catalogue of 87 annonces presented about 8 of them.
 *
 * Ranking here is one score built from four things that pull in different
 * directions, so no single input can dominate:
 *
 *   boost       what the admin decided, -100..100, expiring on its own
 *   freshness   exponential decay, so new listings surface without new
 *               listings being the ONLY thing that surfaces
 *   interest    views and contact reveals, log-scaled — a listing with 400
 *               views is better than one with 40, but not ten times better
 *   rotation    a deterministic shuffle that changes every few minutes
 *
 * Rotation is the part that makes the page feel alive, and it is deliberately
 * NOT random: a random order per request cannot be cached, and would differ
 * between the server render and the client hydration. It is a hash of the
 * listing id and a time bucket, so within a bucket every visitor and every
 * render agree, and between buckets the order genuinely moves.
 */

export type Rankable = {
  id: string;
  published_at?: string | null;
  boost?: number | null;
  boost_until?: string | null;
  view_count?: number | null;
  contact_reveal_count?: number | null;
  /** Listings with more photographs present better; zero is unshowable. */
  photoCount?: number;
};

/** How much each input can move the score. Tuned so boost can decide a tie
 *  and lift a listing a long way, but cannot pin a six-month-old car to the
 *  top of the page for ever — that is what `featured_rank` is for. */
export const WEIGHTS = {
  boost: 0.5,
  freshness: 30,
  interest: 12,
  photos: 6,
  rotation: 8,
} as const;

/** Days after which a listing has lost half its freshness score. */
const FRESHNESS_HALF_LIFE_DAYS = 10;

/** How often the rotation reshuffles. Long enough to be cacheable, short
 *  enough that coming back after lunch shows a different page. */
export const ROTATION_MINUTES = 20;

/**
 * The bucket a moment belongs to. Everything rendered inside one bucket sorts
 * identically — which is what keeps this compatible with ISR and with
 * server/client hydration.
 */
export function rotationSeed(now: Date | number = Date.now(), minutes = ROTATION_MINUTES): number {
  const ms = typeof now === "number" ? now : now.getTime();
  return Math.floor(ms / (minutes * 60_000));
}

/** Small, fast, well-spread integer hash (FNV-1a over the string). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0..1 for a listing within a rotation bucket. */
export function jitter(id: string, seed: number): number {
  return hash(`${id}:${seed}`) / 0xffffffff;
}

/** The boost, if it has not lapsed. */
export function effectiveBoost(row: Rankable, now: Date | number = Date.now()): number {
  const raw = row.boost ?? 0;
  if (!raw) return 0;
  if (!row.boost_until) return raw;
  const until = new Date(row.boost_until).getTime();
  const ms = typeof now === "number" ? now : now.getTime();
  return Number.isFinite(until) && until <= ms ? 0 : raw;
}

/** 1 for something published now, decaying by half every half-life. */
export function freshness(publishedAt: string | null | undefined, now: Date | number = Date.now()): number {
  if (!publishedAt) return 0;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = typeof now === "number" ? now : now.getTime();
  const ageDays = Math.max(0, (ms - t) / 86_400_000);
  return Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Views and contact reveals, log-scaled and capped. A reveal is worth far more
 * than a view: it is somebody actually asking for the seller's number.
 */
export function interest(row: Rankable): number {
  const views = Math.max(0, row.view_count ?? 0);
  const reveals = Math.max(0, row.contact_reveal_count ?? 0);
  return Math.min(1, Math.log10(1 + views + reveals * 10) / 3);
}

export function score(row: Rankable, now: Date | number = Date.now(), seed = rotationSeed(now)): number {
  return (
    WEIGHTS.boost * effectiveBoost(row, now) +
    WEIGHTS.freshness * freshness(row.published_at, now) +
    WEIGHTS.interest * interest(row) +
    WEIGHTS.photos * Math.min(1, (row.photoCount ?? 0) / 4) +
    WEIGHTS.rotation * jitter(row.id, seed)
  );
}

/** Highest score first. Ties break on id so the order is never arbitrary. */
export function rankListings<T extends Rankable>(
  rows: T[],
  now: Date | number = Date.now(),
  seed = rotationSeed(now),
): T[] {
  return [...rows].sort((a, b) => {
    const d = score(b, now, seed) - score(a, now, seed);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * Hand out listings to surfaces without repeating any.
 *
 * The caller asks for named blocks in priority order — `{ cover: 5, runners: 3,
 * marquee: 12 }` — and each takes from what is left. A listing appears in at
 * most one block, which is the whole point: the cover and the rail below it
 * were showing the same car.
 *
 * When the catalogue is too small to fill everything, later blocks come back
 * short rather than borrowing from earlier ones. A half-empty rail is honest;
 * the same car twice is not.
 */
export function allocate<T extends Rankable>(
  ranked: T[],
  blocks: Record<string, number>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  let cursor = 0;
  for (const [name, size] of Object.entries(blocks)) {
    out[name] = ranked.slice(cursor, cursor + size);
    cursor += out[name].length;
  }
  return out;
}
