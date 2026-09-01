/**
 * Diagnostic Mazed — the checked-by-us sheet behind the "Vérifié et approuvé"
 * badge. Shared shapes + normalisation, used by the admin editor, the API that
 * stores it, and the public sheet, so all three agree on what a diagnostic is.
 *
 * The document lives in two jsonb columns (see migration 0148). Everything
 * that reads them goes through `normalizeSections` / `normalizePhotos`: a
 * hand-edited row or an older draft can hold anything, and a public page must
 * never crash on a stray field.
 */

export type DiagnosticState = "ok" | "warn" | "bad";
export type DiagnosticVerdict = "approved" | "reserves" | "failed";
export type DiagnosticStatus = "draft" | "published";

export type DiagnosticItem = {
  label: string;
  state: DiagnosticState;
  note: string | null;
};

export type DiagnosticSection = {
  title: string;
  items: DiagnosticItem[];
};

export type DiagnosticPhoto = {
  /** Path in the public `properties` bucket. */
  path: string;
  caption: string | null;
};

export type Diagnostic = {
  propertyId: string;
  status: DiagnosticStatus;
  verdict: DiagnosticVerdict;
  headline: string | null;
  summary: string | null;
  sections: DiagnosticSection[];
  photos: DiagnosticPhoto[];
  inspectorName: string | null;
  inspectedAt: string | null;
  publishedAt: string | null;
};

export const DIAGNOSTIC_STATES: DiagnosticState[] = ["ok", "warn", "bad"];
export const DIAGNOSTIC_VERDICTS: DiagnosticVerdict[] = ["approved", "reserves", "failed"];

/** Buyer-facing wording for each verdict. */
export const VERDICT_LABEL: Record<DiagnosticVerdict, string> = {
  approved: "Vérifié et approuvé",
  reserves: "Vérifié — avec réserves",
  failed: "Vérifié — non approuvé",
};

export const VERDICT_BLURB: Record<DiagnosticVerdict, string> = {
  approved: "Contrôlé par notre équipe. Aucun point bloquant relevé.",
  reserves: "Contrôlé par notre équipe. Des points à connaître avant d'enchérir.",
  failed: "Contrôlé par notre équipe. Des défauts importants ont été relevés.",
};

export const STATE_LABEL: Record<DiagnosticState, string> = {
  ok: "Conforme",
  warn: "À surveiller",
  bad: "Défaut",
};

/** Cap the document so a runaway paste can't become a 2 MB row on a hot page. */
const MAX_SECTIONS = 20;
const MAX_ITEMS_PER_SECTION = 30;
const MAX_PHOTOS = 24;
const MAX_TEXT = 500;

function text(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function state(v: unknown): DiagnosticState {
  return v === "warn" || v === "bad" ? v : "ok";
}

export function normalizeSections(raw: unknown): DiagnosticSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SECTIONS).flatMap((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const title = text(o.title, 120);
    const itemsRaw = Array.isArray(o.items) ? o.items : [];
    const items = itemsRaw.slice(0, MAX_ITEMS_PER_SECTION).flatMap((i) => {
      const it = (i ?? {}) as Record<string, unknown>;
      const label = text(it.label, 160);
      if (!label) return [];
      return [{ label, state: state(it.state), note: text(it.note) }];
    });
    // A section with no title AND no items carries nothing — drop it rather
    // than render an empty card on the public sheet.
    if (!title && items.length === 0) return [];
    return [{ title: title ?? "Contrôles", items }];
  });
}

export function normalizePhotos(raw: unknown): DiagnosticPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_PHOTOS).flatMap((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const path = text(o.path, 300);
    if (!path) return [];
    return [{ path, caption: text(o.caption, 160) }];
  });
}

export function normalizeVerdict(v: unknown): DiagnosticVerdict {
  return v === "reserves" || v === "failed" ? v : "approved";
}

/** DB row → the shape every surface renders. */
export function toDiagnostic(row: {
  property_id: string;
  status: string;
  verdict: string;
  headline: string | null;
  summary: string | null;
  sections: unknown;
  photos: unknown;
  inspector_name: string | null;
  inspected_at: string | null;
  published_at: string | null;
}): Diagnostic {
  return {
    propertyId: row.property_id,
    status: row.status === "published" ? "published" : "draft",
    verdict: normalizeVerdict(row.verdict),
    headline: text(row.headline, 160),
    summary: typeof row.summary === "string" ? row.summary.slice(0, 4000) : null,
    sections: normalizeSections(row.sections),
    photos: normalizePhotos(row.photos),
    inspectorName: text(row.inspector_name, 120),
    inspectedAt: row.inspected_at,
    publishedAt: row.published_at,
  };
}

/** The columns every diagnostic read selects. */
export const DIAGNOSTIC_SELECT =
  "property_id, status, verdict, headline, summary, sections, photos, inspector_name, inspected_at, published_at";
