"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { GOVERNORATES } from "@/lib/governorates";
import { SHOP_DAYS, dayLabel } from "@/lib/shops/format";
import { governorateLabel } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import { compressImage } from "@/lib/imageCompress";
import { FileText, ImagePlus, Loader2, Lock, Save, Upload } from "lucide-react";

export type ShopPrivate = {
  legal_name: string | null;
  tax_id: string | null;
  rne_number: string | null;
  legal_address: string | null;
  contact_email: string | null;
};

export type ShopDocument = { id: string; kind: string; status: string; created_at: string; note: string | null };

type Shop = {
  id: string;
  name: string;
  description: string;
  phone: string;
  whatsapp: string;
  governorate: string;
  city: string;
  address: string;
  openingHours: Record<string, string>;
  logoUrl: string | null;
  bannerUrl: string | null;
  verificationStatus: string;
};

/** The kinds of paper a shop sends; their names are under `pro.profile.docKind`. */
const DOC_KINDS = ["rne", "patente", "cin_gerant", "autre"];
const DOC_STATUSES = ["submitted", "accepted", "rejected"];

const input =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground focus:border-[var(--gold)] focus:outline-none disabled:opacity-60";
const label = "text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted";

/** PUT a file to a signed upload URL the way the storage API expects it. */
async function putSigned(signedUrl: string, file: Blob): Promise<boolean> {
  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", file);
  const res = await fetch(signedUrl, { method: "PUT", body: form });
  return res.ok;
}

/**
 * The shop's page, edited. Three saves, because they are three different
 * things: what buyers see, who the business legally is (never public), and
 * the documents that earn the badge (never public either).
 */
export function ShopProfileForm({
  canEdit,
  shop,
  initialPrivate,
  documents,
}: {
  canEdit: boolean;
  shop: Shop;
  initialPrivate: ShopPrivate;
  documents: ShopDocument[];
}) {
  const t = useTranslations("pro.profile");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: shop.name,
    description: shop.description,
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    governorate: shop.governorate,
    city: shop.city,
    address: shop.address,
  });
  const [hours, setHours] = useState<Record<string, string>>(shop.openingHours);
  const [priv, setPriv] = useState<ShopPrivate>(initialPrivate);
  const [busy, setBusy] = useState<null | "profile" | "private" | "logo" | "banner" | "doc">(null);
  const [docKind, setDocKind] = useState("rne");

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j: j as { detail?: string; error?: string; path?: string; signedUrl?: string } };
  };

  async function saveProfile() {
    setBusy("profile");
    try {
      const { ok, j } = await post(`/api/pro/shops/${shop.id}`, { ...form, opening_hours: hours });
      if (!ok) return toast(j.detail ?? t("toast.saveFailed"), "error");
      toast(t("toast.saved"), "success");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function savePrivate() {
    setBusy("private");
    try {
      const { ok, j } = await post(`/api/pro/shops/${shop.id}/private`, priv);
      if (!ok) return toast(j.detail ?? t("toast.saveFailed"), "error");
      toast(t("toast.legalSaved"), "success");
    } finally {
      setBusy(null);
    }
  }

  async function uploadImage(kind: "logo" | "banner", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      let out: File = file;
      try {
        out = await compressImage(file, { maxEdge: kind === "logo" ? 512 : 1600, quality: 0.85, format: "webp" });
      } catch {
        out = file;
      }
      const ext = out.name.split(".").pop()?.toLowerCase() || "webp";
      const signed = await post(`/api/pro/shops/${shop.id}/media`, { kind, ext });
      if (!signed.ok || !signed.j.signedUrl || !signed.j.path) return toast(t("toast.refused"), "error");
      if (!(await putSigned(signed.j.signedUrl, out))) {
        return toast(t("toast.badImage"), "error");
      }
      const saved = await post(`/api/pro/shops/${shop.id}`, { [`${kind}_path`]: signed.j.path });
      if (!saved.ok) return toast(saved.j.detail ?? t("toast.saveFailed"), "error");
      toast(kind === "logo" ? t("toast.logoSaved") : t("toast.bannerSaved"), "success");
      router.refresh();
    } catch {
      toast(t("toast.network"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    setBusy("doc");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const signed = await post(`/api/pro/shops/${shop.id}/documents`, { action: "upload_url", ext });
      if (!signed.ok || !signed.j.signedUrl || !signed.j.path) {
        return toast(signed.j.detail ?? t("toast.refused"), "error");
      }
      if (!(await putSigned(signed.j.signedUrl, file))) {
        return toast(t("toast.badFile"), "error");
      }
      const done = await post(`/api/pro/shops/${shop.id}/documents`, { action: "submit", kind: docKind, path: signed.j.path });
      if (!done.ok) return toast(done.j.detail ?? t("toast.saveFailed"), "error");
      toast(t("toast.documentSent"), "success");
      router.refresh();
    } catch {
      toast(t("toast.network"), "error");
    } finally {
      setBusy(null);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="batta-tone-warn rounded-2xl px-4 py-3 text-[12.5px]">
          {t("readOnly")}
        </p>
      )}

      {/* Images */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("images")}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className={`relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border ${!canEdit ? "pointer-events-none opacity-60" : ""}`}>
            {shop.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shop.logoUrl} alt={t("logoAlt")} className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6 text-muted" />
            )}
            {busy === "logo" && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!canEdit || busy !== null}
              onChange={(e) => uploadImage("logo", e.target.files?.[0])} />
          </label>
          <label className={`relative block h-20 min-w-[200px] flex-1 cursor-pointer overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border ${!canEdit ? "pointer-events-none opacity-60" : ""}`}>
            {shop.bannerUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shop.bannerUrl} alt={t("bannerAlt")} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-[12px] font-bold text-muted">{t("addBanner")}</span>
            )}
            {busy === "banner" && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!canEdit || busy !== null}
              onChange={(e) => uploadImage("banner", e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">{t("imagesHint")}</p>
      </section>

      {/* Public page */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("publicTitle")}</h2>
        <div className="mt-3 space-y-3">
          <label className="block"><span className={label}>{t("name")}</span>
            <input className={`${input} mt-1`} value={form.name} onChange={set("name")} maxLength={80} disabled={!canEdit} /></label>
          <label className="block"><span className={label}>{t("description")}</span>
            <textarea className={`${input} mt-1 min-h-[96px]`} value={form.description} onChange={set("description")} maxLength={2000} disabled={!canEdit}
              placeholder={t("descriptionPlaceholder")} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label}>{t("phone")}</span>
              <input className={`${input} mt-1`} value={form.phone} onChange={set("phone")} inputMode="tel" dir="ltr" placeholder="+216 …" disabled={!canEdit} /></label>
            <label className="block"><span className={label}>{t("whatsapp")}</span>
              <input className={`${input} mt-1`} value={form.whatsapp} onChange={set("whatsapp")} inputMode="tel" dir="ltr" placeholder="+216 …" disabled={!canEdit} /></label>
          </div>
          <p className="text-[11.5px] text-muted">
            {t("phonesHint")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className={label}>{t("governorate")}</span>
              <select className={`${input} mt-1`} value={form.governorate} onChange={set("governorate")} disabled={!canEdit}>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{governorateLabel(g, locale)}</option>)}
              </select></label>
            <label className="block"><span className={label}>{t("city")}</span>
              <input className={`${input} mt-1`} value={form.city} onChange={set("city")} maxLength={60} disabled={!canEdit} /></label>
            <label className="block"><span className={label}>{t("address")}</span>
              <input className={`${input} mt-1`} value={form.address} onChange={set("address")} maxLength={200} disabled={!canEdit} /></label>
          </div>
          <div>
            <span className={label}>{t("hours")}</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {SHOP_DAYS.map(([key]) => (
                <label key={key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12.5px] text-muted">{dayLabel(key, locale)}</span>
                  <input className={input} value={hours[key] ?? ""} maxLength={60} disabled={!canEdit}
                    placeholder={key === "sun" ? t("closed") : "8h30 – 18h"}
                    onChange={(e) => setHours((h) => ({ ...h, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={saveProfile} disabled={busy !== null}
            className="batta-btn-luxe tap-target mt-4 inline-flex px-4 py-2.5 text-[13px] disabled:opacity-60">
            {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("save")}
          </button>
        )}
      </section>

      {canEdit && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-extrabold">
            <Lock className="size-4 text-muted" /> {t("legalTitle")}
          </h2>
          <p className="mt-1 text-[11.5px] text-muted">{t("legalHint")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["legal_name", "legalName", false],
              ["tax_id", "taxId", true],
              ["rne_number", "rne", true],
              ["contact_email", "billingEmail", true],
            ] as const).map(([k, l, ltr]) => (
              <label key={k} className="block"><span className={label}>{t(l)}</span>
                <input className={`${input} mt-1`} value={priv[k] ?? ""} dir={ltr ? "ltr" : undefined}
                  onChange={(e) => setPriv((p) => ({ ...p, [k]: e.target.value }))} /></label>
            ))}
            <label className="block sm:col-span-2"><span className={label}>{t("legalAddress")}</span>
              <input className={`${input} mt-1`} value={priv.legal_address ?? ""} onChange={(e) => setPriv((p) => ({ ...p, legal_address: e.target.value }))} /></label>
          </div>
          <button type="button" onClick={savePrivate} disabled={busy !== null}
            className="batta-btn-luxe tap-target mt-4 inline-flex px-4 py-2.5 text-[13px] disabled:opacity-60">
            {busy === "private" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("save")}
          </button>
        </section>
      )}

      {canEdit && (
        <section id="justificatifs" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-extrabold">
            <FileText className="size-4 text-muted" /> {t("documentsTitle")}
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {t("documentsHint")}
          </p>
          {documents.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="font-bold">{DOC_KINDS.includes(d.kind) ? t(`docKind.${d.kind}`) : d.kind}</span>
                  <span className="text-muted">
                    {DOC_STATUSES.includes(d.status) ? t(`docStatus.${d.status}`) : d.status} ·{" "}
                    {formatDate(d.created_at, locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className={`${input} w-auto`} value={docKind} onChange={(e) => setDocKind(e.target.value)}>
              {DOC_KINDS.map((k) => <option key={k} value={k}>{t(`docKind.${k}`)}</option>)}
            </select>
            <label className={`tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-[13px] font-bold hover:border-gold-soft ${busy !== null ? "pointer-events-none opacity-60" : ""}`}>
              {busy === "doc" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t("sendFile")}
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only"
                onChange={(e) => uploadDocument(e.target.files?.[0])} />
            </label>
          </div>
          {shop.verificationStatus === "pending" && (
            <p className="mt-2 text-[11.5px] text-muted">{t("pending")}</p>
          )}
        </section>
      )}
    </div>
  );
}
