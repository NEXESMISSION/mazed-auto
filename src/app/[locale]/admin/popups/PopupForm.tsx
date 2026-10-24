"use client";
import { TONE_CLASS } from "@/components/admin/kit/tones";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import type {
  Popup, PopupMode, PopupVariant, PopupAudience,
  PopupFrequency, PopupDevices, PopupStatus, PopupLocale,
} from "@/lib/popups/schema";
import {
  Eye, Save, Trash2, ChevronDown, AlertCircle,
} from "lucide-react";

/**
 * Single form used for both the "new" and "edit" admin routes. Pass
 * `initial` = null to render the create flow; pass a `Popup` row to
 * render the edit flow with the delete + preview affordances enabled.
 *
 * Designed for Phase 1 — only the modal variant renders on the
 * front-end yet, but the form already accepts banner and sheet so
 * admins can pre-load content before the renderers ship.
 */
export function PopupForm({
  initial,
}: {
  initial: Popup | null;
}) {
  const t = useTranslations("admin.popups.form");
  const router = useRouter();
  const { toast } = useToast();

  // ── Top-level fields ────────────────────────────────────────────────
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [mode, setMode] = useState<PopupMode>(initial?.mode ?? "broadcast");
  const [variant, setVariant] = useState<PopupVariant>(initial?.variant ?? "modal");
  const [status, setStatus] = useState<PopupStatus>(initial?.status ?? "draft");
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0);

  // ── Localised content (fr is required; ar / en optional) ────────────
  const [titleFr, setTitleFr] = useState(initial?.title?.fr ?? "");
  const [titleAr, setTitleAr] = useState(initial?.title?.ar ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title?.en ?? "");
  const [bodyFr, setBodyFr] = useState(initial?.body?.fr ?? "");
  const [bodyAr, setBodyAr] = useState(initial?.body?.ar ?? "");
  const [bodyEn, setBodyEn] = useState(initial?.body?.en ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");

  // ── CTAs ─────────────────────────────────────────────────────────────
  const [ctaPrimaryLabelFr, setCtaPrimaryLabelFr] = useState(initial?.cta_primary?.label?.fr ?? "");
  const [ctaPrimaryHref, setCtaPrimaryHref] = useState(initial?.cta_primary?.href ?? "");
  const [ctaSecondaryLabelFr, setCtaSecondaryLabelFr] = useState(initial?.cta_secondary?.label?.fr ?? "");
  const [ctaSecondaryHref, setCtaSecondaryHref] = useState(initial?.cta_secondary?.href ?? "");

  // ── Audience ─────────────────────────────────────────────────────────
  const initialAudience: PopupAudience = initial?.audience ?? { scope: "all" };
  const [audienceScope, setAudienceScope] = useState<PopupAudience["scope"]>(
    initialAudience.scope,
  );
  const [audienceRoles, setAudienceRoles] = useState<string[]>(
    initialAudience.scope === "logged_in" && initialAudience.roles
      ? initialAudience.roles
      : [],
  );

  // ── Targeting / schedule / frequency ────────────────────────────────
  const [pagesRaw, setPagesRaw] = useState((initial?.pages ?? []).join(", "));
  const [locales, setLocales] = useState<PopupLocale[]>(
    (initial?.locales as PopupLocale[]) ?? ["fr"],
  );
  const [devices, setDevices] = useState<PopupDevices>(initial?.devices ?? "both");
  const [startsAt, setStartsAt] = useState(isoToLocal(initial?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(isoToLocal(initial?.ends_at ?? null));
  const [frequency, setFrequency] = useState<PopupFrequency>(initial?.frequency ?? "once_per_user");
  const [frequencyN, setFrequencyN] = useState<number>(initial?.frequency_n ?? 7);
  const [dismissible, setDismissible] = useState<boolean>(initial?.dismissible ?? true);
  const [forceAction, setForceAction] = useState<boolean>(initial?.force_action ?? false);

  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Preview state — opens a live render of the popup in a backdrop
  //    overlay. Reuses the same ModalPopup the real PopupManager uses
  //    so what the admin sees is exactly what users will see.
  const [previewOpen, setPreviewOpen] = useState(false);

  const payload = useMemo(() => buildPayload({
    slug, mode, variant, status, priority,
    titleFr, titleAr, titleEn, bodyFr, bodyAr, bodyEn,
    imageUrl, icon,
    ctaPrimaryLabelFr, ctaPrimaryHref,
    ctaSecondaryLabelFr, ctaSecondaryHref,
    audienceScope, audienceRoles,
    pagesRaw, locales, devices,
    startsAt, endsAt, frequency, frequencyN,
    dismissible, forceAction,
  }), [
    slug, mode, variant, status, priority,
    titleFr, titleAr, titleEn, bodyFr, bodyAr, bodyEn,
    imageUrl, icon,
    ctaPrimaryLabelFr, ctaPrimaryHref,
    ctaSecondaryLabelFr, ctaSecondaryHref,
    audienceScope, audienceRoles,
    pagesRaw, locales, devices,
    startsAt, endsAt, frequency, frequencyN,
    dismissible, forceAction,
  ]);

  async function onSave() {
    setError(null);
    startSaving(async () => {
      const url = initial
        ? `/api/admin/popups/${initial.id}`
        : `/api/admin/popups`;
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        item?: Popup;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "save_failed");
        toast(data.error ?? t("unknownError"), "error");
        return;
      }
      toast(initial ? t("updated") : t("created"), "success");
      router.push("/admin/popups");
      router.refresh();
    });
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(t("confirmDelete", { slug }))) return;
    const res = await fetch(`/api/admin/popups/${initial.id}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast((d as { error?: string }).error ?? t("deleteFailed"), "error");
      return;
    }
    toast(t("deleted"), "success");
    router.push("/admin/popups");
    router.refresh();
  }

  return (
    <div className="pb-24">
      {/* Action bar — sticky so save is always one tap away from any field. */}
      <div className="sticky top-0 z-20 -mx-1 mb-5 flex items-center justify-between gap-3 rounded-2xl bg-background/95 px-2 py-2.5 backdrop-blur">
        <div className="text-[13px] font-bold text-foreground">
          {initial ? t("editTitle") : t("newTitle")}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-2 text-[11.5px] font-bold text-foreground ring-1 ring-border transition hover:ring-gold-soft/50"
          >
            <Eye className="size-4" strokeWidth={2.2} />
            {t("preview")}
          </button>
          {initial && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tone-bad-ring)] px-3 py-2 text-[11.5px] font-bold text-[var(--tone-bad)] transition hover:border-[var(--tone-bad)] hover:bg-[var(--tone-bad-bg)]"
            >
              <Trash2 className="size-4" strokeWidth={2.2} />
              {t("delete")}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-4 py-2 text-[12px] disabled:opacity-50"
          >
            <Save className="size-4" strokeWidth={2.2} />
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      {error && (
        <div className={`mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold ring-1 ${TONE_CLASS.bad}`}>
          <AlertCircle className="size-4" strokeWidth={2.2} />
          {humanError(error, t)}
        </div>
      )}

      {/* ─── Identification ──────────────────────────────────────────── */}
      <Section title={t("identification.title")} subtitle={t("identification.subtitle")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label={t("identification.slug")} required>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("identification.slugPlaceholder")}
              dir="ltr"
              className="batta-input"
            />
          </Field>
          <Field label={t("identification.status")}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PopupStatus)}
              className="batta-input"
            >
              <option value="draft">{t("identification.statuses.draft")}</option>
              <option value="live">{t("identification.statuses.live")}</option>
              <option value="paused">{t("identification.statuses.paused")}</option>
              <option value="archived">{t("identification.statuses.archived")}</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label={t("identification.mode")} hint={t("identification.modeHint")}>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PopupMode)}
              className="batta-input"
            >
              <option value="broadcast">{t("identification.modes.broadcast")}</option>
              <option value="rule">{t("identification.modes.rule")}</option>
            </select>
          </Field>
          <Field label={t("identification.variant")} hint={t("identification.variantHint")}>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as PopupVariant)}
              className="batta-input"
            >
              <option value="modal">{t("identification.variants.modal")}</option>
              <option value="banner">{t("identification.variants.banner")}</option>
              <option value="sheet">{t("identification.variants.sheet")}</option>
            </select>
          </Field>
          <Field label={t("identification.priority")} hint={t("identification.priorityHint")}>
            <input
              type="number"
              min={-100}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
              className="batta-input"
            />
          </Field>
        </div>
      </Section>

      {/* ─── Contenu ─────────────────────────────────────────────────── */}
      <Section title={t("content.title")} subtitle={t("content.subtitle")}>
        <LocalisedInputs
          label={t("content.titleField")}
          fr={titleFr} setFr={setTitleFr}
          ar={titleAr} setAr={setTitleAr}
          en={titleEn} setEn={setTitleEn}
          required
        />
        <div className="mt-4">
          <LocalisedInputs
            label={t("content.body")}
            fr={bodyFr} setFr={setBodyFr}
            ar={bodyAr} setAr={setBodyAr}
            en={bodyEn} setEn={setBodyEn}
            multiline
          />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field label={t("content.image")} hint={t("content.imageHint")}>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              dir="ltr"
              className="batta-input"
            />
          </Field>
          <Field label={t("content.icon")} hint={t("content.iconHint")}>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Sparkles"
              dir="ltr"
              className="batta-input"
            />
          </Field>
        </div>
      </Section>

      {/* ─── CTAs ────────────────────────────────────────────────────── */}
      <Section title={t("ctas.title")} subtitle={t("ctas.subtitle")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label={t("ctas.primaryLabel")}>
            <input
              value={ctaPrimaryLabelFr}
              onChange={(e) => setCtaPrimaryLabelFr(e.target.value)}
              placeholder="Continuer"
              dir="ltr"
              className="batta-input"
            />
          </Field>
          <Field label={t("ctas.primaryHref")}>
            <input
              value={ctaPrimaryHref}
              onChange={(e) => setCtaPrimaryHref(e.target.value)}
              placeholder="/annonces"
              dir="ltr"
              className="batta-input"
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field label={t("ctas.secondaryLabel")}>
            <input
              value={ctaSecondaryLabelFr}
              onChange={(e) => setCtaSecondaryLabelFr(e.target.value)}
              placeholder="Plus tard"
              dir="ltr"
              className="batta-input"
            />
          </Field>
          <Field label={t("ctas.secondaryHref")}>
            <input
              value={ctaSecondaryHref}
              onChange={(e) => setCtaSecondaryHref(e.target.value)}
              placeholder="/help"
              dir="ltr"
              className="batta-input"
            />
          </Field>
        </div>
      </Section>

      {/* ─── Audience ────────────────────────────────────────────────── */}
      <Section title={t("audience.title")} subtitle={t("audience.subtitle")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label={t("audience.scope")}>
            <select
              value={audienceScope}
              onChange={(e) => setAudienceScope(e.target.value as PopupAudience["scope"])}
              className="batta-input"
            >
              <option value="all">{t("audience.scopes.all")}</option>
              <option value="anon">{t("audience.scopes.anon")}</option>
              <option value="logged_in">{t("audience.scopes.logged_in")}</option>
            </select>
          </Field>
          {audienceScope === "logged_in" && (
            <Field label={t("audience.roles")} hint={t("audience.rolesHint")}>
              <RoleMultiSelect value={audienceRoles} onChange={setAudienceRoles} />
            </Field>
          )}
        </div>
      </Section>

      {/* ─── Ciblage pages / langues / appareils ─────────────────────── */}
      <Section title={t("targeting.title")} subtitle={t("targeting.subtitle")}>
        <Field label={t("targeting.pages")} hint={t("targeting.pagesHint")}>
          <input
            value={pagesRaw}
            onChange={(e) => setPagesRaw(e.target.value)}
            placeholder="/, /auctions/*"
            dir="ltr"
            className="batta-input"
          />
        </Field>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field label={t("targeting.languages")}>
            <div className="flex gap-2">
              {(["fr", "ar", "en"] as const).map((l) => (
                <label key={l} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[11.5px] font-bold ring-1 ring-border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={locales.includes(l)}
                    onChange={(e) => {
                      setLocales((prev) =>
                        e.target.checked ? [...new Set([...prev, l])] : prev.filter((x) => x !== l),
                      );
                    }}
                  />
                  {l.toUpperCase()}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t("targeting.devices")}>
            <select
              value={devices}
              onChange={(e) => setDevices(e.target.value as PopupDevices)}
              className="batta-input"
            >
              <option value="both">{t("targeting.deviceOptions.both")}</option>
              <option value="mobile">{t("targeting.deviceOptions.mobile")}</option>
              <option value="desktop">{t("targeting.deviceOptions.desktop")}</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* ─── Diffusion ────────────────────────────────────────────────── */}
      {mode === "broadcast" && (
        <Section title={t("window.title")} subtitle={t("window.subtitle")}>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label={t("window.starts")}>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="batta-input"
              />
            </Field>
            <Field label={t("window.ends")}>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="batta-input"
              />
            </Field>
          </div>
        </Section>
      )}

      {/* ─── Fréquence + comportement ────────────────────────────────── */}
      <Section title={t("frequency.title")} subtitle={t("frequency.subtitle")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label={t("frequency.label")}>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PopupFrequency)}
              className="batta-input"
            >
              <option value="once_per_user">{t("frequency.options.once_per_user")}</option>
              <option value="once_per_session">{t("frequency.options.once_per_session")}</option>
              <option value="every_visit">{t("frequency.options.every_visit")}</option>
              <option value="every_n_days">{t("frequency.options.every_n_days")}</option>
            </select>
          </Field>
          {frequency === "every_n_days" && (
            <Field label={t("frequency.nDays")}>
              <input
                type="number"
                min={1}
                max={365}
                value={frequencyN}
                onChange={(e) => setFrequencyN(Math.max(1, Number(e.target.value) || 1))}
                className="batta-input"
              />
            </Field>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={dismissible}
              onChange={(e) => setDismissible(e.target.checked)}
            />
            {t("frequency.dismissible")}
          </label>
          <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={forceAction}
              onChange={(e) => setForceAction(e.target.checked)}
            />
            {t("frequency.forceAction")}
          </label>
        </div>
      </Section>

      {/* ─── Preview overlay ─────────────────────────────────────────── */}
      {previewOpen && (
        <PreviewOverlay
          onClose={() => setPreviewOpen(false)}
          title={titleFr || t("untitled")}
          body={bodyFr || ""}
          imageUrl={imageUrl}
          icon={icon}
          ctaPrimary={ctaPrimaryLabelFr && ctaPrimaryHref ? { label: ctaPrimaryLabelFr, href: ctaPrimaryHref } : null}
          ctaSecondary={ctaSecondaryLabelFr && ctaSecondaryHref ? { label: ctaSecondaryLabelFr, href: ctaSecondaryHref } : null}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function buildPayload(s: {
  slug: string; mode: PopupMode; variant: PopupVariant; status: PopupStatus; priority: number;
  titleFr: string; titleAr: string; titleEn: string;
  bodyFr: string; bodyAr: string; bodyEn: string;
  imageUrl: string; icon: string;
  ctaPrimaryLabelFr: string; ctaPrimaryHref: string;
  ctaSecondaryLabelFr: string; ctaSecondaryHref: string;
  audienceScope: PopupAudience["scope"]; audienceRoles: string[];
  pagesRaw: string; locales: PopupLocale[]; devices: PopupDevices;
  startsAt: string; endsAt: string;
  frequency: PopupFrequency; frequencyN: number;
  dismissible: boolean; forceAction: boolean;
}) {
  const audience: Record<string, unknown> =
    s.audienceScope === "all" || s.audienceScope === "anon"
      ? { scope: s.audienceScope }
      : { scope: "logged_in", ...(s.audienceRoles.length > 0 ? { roles: s.audienceRoles } : {}) };

  const pages = s.pagesRaw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    slug: s.slug,
    mode: s.mode,
    variant: s.variant,
    status: s.status,
    priority: s.priority,
    title: pickLocalised(s.titleFr, s.titleAr, s.titleEn),
    body: pickLocalised(s.bodyFr, s.bodyAr, s.bodyEn),
    image_url: s.imageUrl.trim() || null,
    icon: s.icon.trim() || null,
    cta_primary: s.ctaPrimaryLabelFr && s.ctaPrimaryHref ? {
      label: pickLocalised(s.ctaPrimaryLabelFr, "", ""),
      href: s.ctaPrimaryHref,
      tone: "primary",
    } : null,
    cta_secondary: s.ctaSecondaryLabelFr && s.ctaSecondaryHref ? {
      label: pickLocalised(s.ctaSecondaryLabelFr, "", ""),
      href: s.ctaSecondaryHref,
      tone: "secondary",
    } : null,
    audience,
    pages,
    locales: s.locales,
    devices: s.devices,
    starts_at: localToIso(s.startsAt),
    ends_at: localToIso(s.endsAt),
    frequency: s.frequency,
    frequency_n: s.frequency === "every_n_days" ? s.frequencyN : null,
    dismissible: s.dismissible,
    force_action: s.forceAction,
  };
}

function pickLocalised(fr: string, ar: string, en: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (fr.trim()) out.fr = fr.trim();
  if (ar.trim()) out.ar = ar.trim();
  if (en.trim()) out.en = en.trim();
  return out;
}

function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const KNOWN_ERRORS = [
  "slug_invalid", "title_required", "body_invalid", "mode_invalid",
  "variant_invalid", "audience_invalid", "forbidden", "auth",
];

/** The API's error code in the operator's words (`admin.popups.form.errors`). */
function humanError(code: string, t: (key: string) => string): string {
  return KNOWN_ERRORS.includes(code) ? t(`errors.${code}`) : code;
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="batta-frame mt-5 p-5">
      <h3 className="text-[14px] font-extrabold leading-tight text-foreground">{title}</h3>
      {subtitle && <p className="mt-1 text-[11.5px] text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
        {label}
        {required && <span className="text-[var(--tone-bad)]">*</span>}
      </div>
      {children}
      {hint && <div className="mt-1 text-[10.5px] text-muted">{hint}</div>}
    </label>
  );
}

function LocalisedInputs({
  label, fr, setFr, ar, setAr, en, setEn, required, multiline,
}: {
  label: string;
  fr: string; setFr: (v: string) => void;
  ar: string; setAr: (v: string) => void;
  en: string; setEn: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  const t = useTranslations("admin.popups.form");
  const [active, setActive] = useState<"fr" | "ar" | "en">("fr");
  const value = active === "fr" ? fr : active === "ar" ? ar : en;
  const setter = active === "fr" ? setFr : active === "ar" ? setAr : setEn;
  const Input = multiline ? "textarea" : "input";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
          {label}{required && <span className="text-[var(--tone-bad)]">*</span>}
        </div>
        <div className="flex gap-1">
          {(["fr", "ar", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition ${
                active === l
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <Input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setter(e.target.value)
        }
        // Each language is typed in its own direction, whatever the console's.
        dir={active === "ar" ? "rtl" : "ltr"}
        className={`batta-input ${multiline ? "min-h-[100px]" : ""}`}
        placeholder={t("textIn", { lang: active.toUpperCase() })}
      />
    </div>
  );
}

function RoleMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("admin.popups.form.roles");
  const ROLES = ["individual", "agency", "bank", "bailiff", "inspector", "admin"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLES.map((r) => {
        const active = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => {
              onChange(
                active ? value.filter((v) => v !== r) : [...value, r],
              );
            }}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-[var(--border)] bg-surface text-muted hover:border-[var(--border-strong)] hover:text-foreground"
            }`}
          >
            {t(r)}
          </button>
        );
      })}
    </div>
  );
}

// Lightweight preview overlay — renders the same shapes the real
// ModalPopup uses (gold ring, image, title/body, CTAs) but in an
// admin-only context so it doesn't fire impressions or hit the API.
function PreviewOverlay({
  onClose, title, body, imageUrl, icon, ctaPrimary, ctaSecondary,
}: {
  onClose: () => void;
  title: string;
  body: string;
  imageUrl: string;
  icon: string;
  ctaPrimary: { label: string; href: string } | null;
  ctaSecondary: { label: string; href: string } | null;
}) {
  const t = useTranslations("admin.popups.form");
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface ring-1 ring-gold/30 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute end-3 top-3 z-10 rounded-full bg-black/40 px-2 py-1 text-[10px] font-bold text-white"
        >
          {t("close")}
        </button>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="p-6 text-center">
          {icon && (
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-gold">
              {icon}
            </div>
          )}
          <h3 className="text-[18px] font-extrabold leading-tight">{title}</h3>
          {body && (
            <p className="mt-2 whitespace-pre-line text-[13px] text-foreground/80">
              {body}
            </p>
          )}
          {(ctaPrimary || ctaSecondary) && (
            <div className="mt-5 flex flex-col gap-2">
              {ctaPrimary && (
                <span className="batta-btn-luxe tap-target inline-flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px]">
                  {ctaPrimary.label}
                </span>
              )}
              {ctaSecondary && (
                <span className="inline-flex w-full items-center justify-center rounded-full bg-surface-2 px-4 py-2.5 text-[12px] font-bold text-muted ring-1 ring-border">
                  {ctaSecondary.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Ensure the underlying ChevronDown import isn't tree-shaken away —
// reserved for the upcoming "advanced audience filters" disclosure.
const _keepalive = ChevronDown;
void _keepalive;
