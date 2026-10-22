"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { GOVERNORATES } from "@/lib/governorates";
import { SHOP_DAYS } from "@/lib/shops/format";
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

const DOC_KIND: Record<string, string> = {
  rne: "Extrait RNE",
  patente: "Patente",
  cin_gerant: "CIN du gérant",
  autre: "Autre document",
};
const DOC_STATUS: Record<string, string> = {
  submitted: "Envoyé — en attente d'examen",
  accepted: "Accepté",
  rejected: "Refusé",
};

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
      if (!ok) return toast(j.detail ?? "Enregistrement impossible.", "error");
      toast("Votre page est à jour.", "success");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function savePrivate() {
    setBusy("private");
    try {
      const { ok, j } = await post(`/api/pro/shops/${shop.id}/private`, priv);
      if (!ok) return toast(j.detail ?? "Enregistrement impossible.", "error");
      toast("Informations légales enregistrées.", "success");
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
      if (!signed.ok || !signed.j.signedUrl || !signed.j.path) return toast("Le serveur a refusé l'envoi.", "error");
      if (!(await putSigned(signed.j.signedUrl, out))) {
        return toast("Image refusée : JPEG, PNG ou WebP de moins de 5 Mo.", "error");
      }
      const saved = await post(`/api/pro/shops/${shop.id}`, { [`${kind}_path`]: signed.j.path });
      if (!saved.ok) return toast(saved.j.detail ?? "Enregistrement impossible.", "error");
      toast(kind === "logo" ? "Logo mis à jour." : "Bannière mise à jour.", "success");
      router.refresh();
    } catch {
      toast("Erreur réseau.", "error");
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
        return toast(signed.j.detail ?? "Le serveur a refusé l'envoi.", "error");
      }
      if (!(await putSigned(signed.j.signedUrl, file))) {
        return toast("Fichier refusé : PDF, JPEG ou PNG de moins de 10 Mo.", "error");
      }
      const done = await post(`/api/pro/shops/${shop.id}/documents`, { action: "submit", kind: docKind, path: signed.j.path });
      if (!done.ok) return toast(done.j.detail ?? "Enregistrement impossible.", "error");
      toast("Justificatif envoyé. Notre équipe l'examine.", "success");
      router.refresh();
    } catch {
      toast("Erreur réseau.", "error");
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
          Seuls le propriétaire et les gérants peuvent modifier la boutique.
        </p>
      )}

      {/* Images */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">Logo et bannière</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className={`relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border ${!canEdit ? "pointer-events-none opacity-60" : ""}`}>
            {shop.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shop.logoUrl} alt="Logo" className="size-full object-cover" />
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
              <img src={shop.bannerUrl} alt="Bannière" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-[12px] font-bold text-muted">Ajouter une bannière</span>
            )}
            {busy === "banner" && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!canEdit || busy !== null}
              onChange={(e) => uploadImage("banner", e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">JPEG, PNG ou WebP. Le logo est recadré en carré, la bannière en large.</p>
      </section>

      {/* Public page */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">Ce que voient les acheteurs</h2>
        <div className="mt-3 space-y-3">
          <label className="block"><span className={label}>Nom de la boutique</span>
            <input className={`${input} mt-1`} value={form.name} onChange={set("name")} maxLength={80} disabled={!canEdit} /></label>
          <label className="block"><span className={label}>Présentation</span>
            <textarea className={`${input} mt-1 min-h-[96px]`} value={form.description} onChange={set("description")} maxLength={2000} disabled={!canEdit}
              placeholder="Ce que vous vendez ou louez, depuis quand, vos services (reprise, garantie, livraison…)." /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label}>Téléphone</span>
              <input className={`${input} mt-1`} value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="+216 …" disabled={!canEdit} /></label>
            <label className="block"><span className={label}>WhatsApp</span>
              <input className={`${input} mt-1`} value={form.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="+216 …" disabled={!canEdit} /></label>
          </div>
          <p className="text-[11.5px] text-muted">
            Vos numéros ne figurent jamais dans le code de la page : ils s&apos;affichent quand un acheteur les demande.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className={label}>Gouvernorat</span>
              <select className={`${input} mt-1`} value={form.governorate} onChange={set("governorate")} disabled={!canEdit}>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select></label>
            <label className="block"><span className={label}>Ville</span>
              <input className={`${input} mt-1`} value={form.city} onChange={set("city")} maxLength={60} disabled={!canEdit} /></label>
            <label className="block"><span className={label}>Adresse</span>
              <input className={`${input} mt-1`} value={form.address} onChange={set("address")} maxLength={200} disabled={!canEdit} /></label>
          </div>
          <div>
            <span className={label}>Horaires</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {SHOP_DAYS.map(([key, day]) => (
                <label key={key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12.5px] text-muted">{day}</span>
                  <input className={input} value={hours[key] ?? ""} maxLength={60} disabled={!canEdit}
                    placeholder={key === "sun" ? "Fermé" : "8h30 – 18h"}
                    onChange={(e) => setHours((h) => ({ ...h, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={saveProfile} disabled={busy !== null}
            className="batta-btn-luxe tap-target mt-4 inline-flex px-4 py-2.5 text-[13px] disabled:opacity-60">
            {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Enregistrer
          </button>
        )}
      </section>

      {canEdit && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-extrabold">
            <Lock className="size-4 text-muted" /> Informations légales
          </h2>
          <p className="mt-1 text-[11.5px] text-muted">Jamais affichées publiquement. Elles servent à vos factures.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["legal_name", "Raison sociale"],
              ["tax_id", "Matricule fiscal"],
              ["rne_number", "Numéro RNE"],
              ["contact_email", "E-mail de facturation"],
            ] as const).map(([k, l]) => (
              <label key={k} className="block"><span className={label}>{l}</span>
                <input className={`${input} mt-1`} value={priv[k] ?? ""} onChange={(e) => setPriv((p) => ({ ...p, [k]: e.target.value }))} /></label>
            ))}
            <label className="block sm:col-span-2"><span className={label}>Adresse du siège</span>
              <input className={`${input} mt-1`} value={priv.legal_address ?? ""} onChange={(e) => setPriv((p) => ({ ...p, legal_address: e.target.value }))} /></label>
          </div>
          <button type="button" onClick={savePrivate} disabled={busy !== null}
            className="batta-btn-luxe tap-target mt-4 inline-flex px-4 py-2.5 text-[13px] disabled:opacity-60">
            {busy === "private" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Enregistrer
          </button>
        </section>
      )}

      {canEdit && (
        <section id="justificatifs" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-extrabold">
            <FileText className="size-4 text-muted" /> Justificatifs
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Extrait RNE, patente, CIN du gérant. Stockés en privé : seule l&apos;équipe Mazed les consulte, pour
            accorder le badge « Boutique vérifiée ».
          </p>
          {documents.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="font-bold">{DOC_KIND[d.kind] ?? d.kind}</span>
                  <span className="text-muted">
                    {DOC_STATUS[d.status] ?? d.status} · {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className={`${input} w-auto`} value={docKind} onChange={(e) => setDocKind(e.target.value)}>
              {Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className={`tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-[13px] font-bold hover:border-gold-soft ${busy !== null ? "pointer-events-none opacity-60" : ""}`}>
              {busy === "doc" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Envoyer un fichier
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only"
                onChange={(e) => uploadDocument(e.target.files?.[0])} />
            </label>
          </div>
          {shop.verificationStatus === "pending" && (
            <p className="mt-2 text-[11.5px] text-muted">Vos justificatifs sont en cours d&apos;examen.</p>
          )}
        </section>
      )}
    </div>
  );
}
