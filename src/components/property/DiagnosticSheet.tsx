import { getServerSupabase } from "@/lib/supabase/server";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import {
  DIAGNOSTIC_SELECT,
  STATE_LABEL,
  VERDICT_BLURB,
  VERDICT_LABEL,
  toDiagnostic,
  type Diagnostic,
  type DiagnosticState,
} from "@/lib/diagnostics";
import { BadgeCheck, CircleAlert, CircleX, Camera } from "lucide-react";

/**
 * The buyer-facing Mazed diagnostic — the sheet behind the "Vérifié et
 * approuvé" badge.
 *
 * Self-contained on purpose: it does its own read and renders NOTHING when the
 * listing has no published diagnostic, so adding it to a page is one line and
 * a listing we haven't checked simply shows no badge and no section. RLS
 * (0148) only exposes published rows, so an unpublished draft cannot leak
 * through this component even if it is mounted.
 */

export async function fetchPublishedDiagnostic(
  propertyId: string,
): Promise<Diagnostic | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("vehicle_diagnostics")
    .select(DIAGNOSTIC_SELECT)
    .eq("property_id", propertyId)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  return toDiagnostic(data as Parameters<typeof toDiagnostic>[0]);
}

const STATE_STYLE: Record<DiagnosticState, { tone: string; dot: string }> = {
  ok: { tone: "text-[var(--success)]", dot: "bg-[var(--success)]" },
  warn: { tone: "text-[#92400e]", dot: "bg-[#f59e0b]" },
  bad: { tone: "text-[var(--accent-deep)]", dot: "bg-[var(--accent)]" },
};

/** Compact badge — for headers and cards. Renders null without a diagnostic. */
export function DiagnosticBadge({ diagnostic }: { diagnostic: Diagnostic | null }) {
  if (!diagnostic) return null;
  const Icon =
    diagnostic.verdict === "approved"
      ? BadgeCheck
      : diagnostic.verdict === "reserves"
        ? CircleAlert
        : CircleX;
  return (
    <a
      href="#diagnostic-mazed"
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold-faint)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--gold)] ring-1 ring-[var(--gold-soft)] transition hover:bg-[var(--gold)] hover:text-white"
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
      {VERDICT_LABEL[diagnostic.verdict]}
    </a>
  );
}

/** The full sheet. Pass a pre-fetched diagnostic, or a propertyId to fetch. */
export async function DiagnosticSheet({
  propertyId,
  diagnostic: passed,
}: {
  propertyId: string;
  diagnostic?: Diagnostic | null;
}) {
  const diagnostic = passed !== undefined ? passed : await fetchPublishedDiagnostic(propertyId);
  if (!diagnostic) return null;

  const checked = diagnostic.sections.reduce((n, s) => n + s.items.length, 0);
  const findings = diagnostic.sections.reduce(
    (n, s) => n + s.items.filter((i) => i.state !== "ok").length,
    0,
  );

  return (
    <section id="diagnostic-mazed" className="batta-frame mx-4 mt-4 p-5 lg:mx-0">
      <h2 className="batta-eyebrow flex items-center gap-2">
        <span aria-hidden className="batta-gold-rule-short" />
        Diagnostic Mazed
      </h2>

      {/* What the badge means — stated in full, because "vérifié" is exactly
          the kind of word a marketplace usually leaves vague. */}
      <div className="mt-2 flex items-start gap-3 rounded-2xl bg-[var(--gold-faint)] p-4 ring-1 ring-[var(--gold-soft)]">
        <BadgeCheck className="mt-0.5 size-6 shrink-0 text-[var(--gold)]" strokeWidth={2.2} />
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold leading-tight text-foreground">
            {VERDICT_LABEL[diagnostic.verdict]}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {VERDICT_BLURB[diagnostic.verdict]} Ce véhicule a été contrôlé par
            nous — ce n&apos;est pas une déclaration du vendeur.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {diagnostic.inspectorName && <span>Par {diagnostic.inspectorName}</span>}
            {diagnostic.inspectedAt && (
              <span>
                Le {new Date(diagnostic.inspectedAt).toLocaleDateString("fr-FR")}
              </span>
            )}
            {checked > 0 && (
              <span>
                {checked} point{checked > 1 ? "s" : ""} contrôlé{checked > 1 ? "s" : ""}
                {findings > 0 ? ` · ${findings} à signaler` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {diagnostic.headline && (
        <p className="mt-3 text-[14px] font-bold leading-snug text-foreground">
          {diagnostic.headline}
        </p>
      )}
      {diagnostic.summary && (
        <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">
          {diagnostic.summary}
        </p>
      )}

      {/* Checks */}
      {diagnostic.sections.length > 0 && (
        <div className="mt-4 space-y-3">
          {diagnostic.sections.map((sec, i) => (
            <div key={i} className="rounded-2xl bg-surface-2 p-3.5 ring-1 ring-border">
              <div className="text-[12.5px] font-extrabold text-foreground">{sec.title}</div>
              {sec.items.length === 0 ? (
                <p className="mt-1 text-[11.5px] text-muted">Aucun point relevé.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {sec.items.map((it, k) => (
                    <li key={k} className="flex items-start gap-2.5 py-2">
                      <span
                        aria-hidden
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${STATE_STYLE[it.state].dot}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[12.5px] font-semibold text-foreground">
                            {it.label}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${STATE_STYLE[it.state].tone}`}
                          >
                            {STATE_LABEL[it.state]}
                          </span>
                        </div>
                        {it.note && (
                          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{it.note}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Our photos — kept distinct from the seller's gallery on purpose. */}
      {diagnostic.photos.length > 0 && (
        <div className="mt-4">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <Camera className="size-3.5" /> Photos prises lors du contrôle
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {diagnostic.photos.map((ph, i) => (
              <figure key={ph.path} className="space-y-1">
                <ImageLightbox
                  src={propertyPhotoUrl(ph.path)}
                  alt={ph.caption ?? `Photo du diagnostic ${i + 1}`}
                  triggerClassName="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={propertyPhotoUrl(ph.path)}
                    alt={ph.caption ?? `Photo du diagnostic ${i + 1}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </ImageLightbox>
                {ph.caption && (
                  <figcaption className="text-[10.5px] leading-snug text-muted">
                    {ph.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
