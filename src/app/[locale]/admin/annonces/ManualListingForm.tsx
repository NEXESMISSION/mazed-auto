"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { GOVERNORATES } from "@/lib/governorates";
import { PhotoUploader, type UploadedPhoto } from "@/components/listing/PhotoUploader";
import {
  AttributeField,
  CheckField,
  Field,
  INPUT,
  Label,
  type ListingAttribute,
} from "@/components/listing/fields";
import { Plus, Search, X } from "lucide-react";

/**
 * Créer une annonce — the admin typing in a listing for a seller who called,
 * walked in, or sent photos over WhatsApp.
 *
 * The counterpart to the seller wizard, and deliberately not a copy of it:
 * no payment step, no attestation checkbox, no queue. An admin filling this in
 * IS the waiver and IS the moderation, and the API records who waived it.
 *
 * The annonce belongs to the seller, not to the admin: it lands in their
 * « Mes annonces », they can renew it, and the phone on it is theirs.
 */

export type AdminSeller = { id: string; name: string; phone: string | null };

export type AdminCategory = {
  id: string;
  label: string;
  groupLabel: string;
  kind: "vehicle" | "part";
  attributes: ListingAttribute[];
};

type Fitment = { make: string; model: string; yearFrom: string; yearTo: string };


export function ManualListingForm({
  sellers,
  categories,
  /**
   * On its own page (`/admin/annonces/nouvelle`) the form is the whole point,
   * so it opens expanded and drops the collapse control. Inline — where it
   * still has to share a screen — it stays a teaser until asked for.
   */
  standalone = false,
}: {
  sellers: AdminSeller[];
  categories: AdminCategory[];
  standalone?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(standalone);
  const [busy, setBusy] = useState(false);

  const [sellerQuery, setSellerQuery] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [onRequest, setOnRequest] = useState(false);
  const [negotiable, setNegotiable] = useState(true);
  const [condition, setCondition] = useState("used");
  const [governorate, setGovernorate] = useState<string>(GOVERNORATES[0]);
  const [attrs, setAttrs] = useState<Record<string, string | boolean>>({});
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [fitments, setFitments] = useState<Fitment[]>([]);
  const [publishNow, setPublishNow] = useState(true);

  const seller = sellers.find((s) => s.id === sellerId) ?? null;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isPart = category?.kind === "part";

  const matches = useMemo(() => {
    const q = sellerQuery.trim().toLowerCase();
    const pool = q
      ? sellers.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.phone ?? "").replace(/\s/g, "").includes(q),
        )
      : sellers;
    return pool.slice(0, 8);
  }, [sellers, sellerQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminCategory[]>();
    for (const c of categories) {
      const list = map.get(c.groupLabel) ?? [];
      list.push(c);
      map.set(c.groupLabel, list);
    }
    return [...map.entries()];
  }, [categories]);

  function pickSeller(s: AdminSeller) {
    setSellerId(s.id);
    setSellerQuery("");
    // Prefill from the profile, then let the admin override: the number the
    // seller wants on the annonce is often not the one on their account.
    if (!contactName) setContactName(s.name);
    if (!contactPhone && s.phone) setContactPhone(s.phone);
  }

  function validate(): string | null {
    if (!sellerId) return "Choisissez le vendeur à qui appartient l'annonce.";
    if (!categoryId) return "Choisissez une catégorie.";
    if (title.trim().length < 3) return "Donnez un titre à l'annonce.";
    if (!onRequest && !(Number(price) > 0)) {
      return "Indiquez un prix, ou cochez « prix sur demande ».";
    }
    for (const a of category?.attributes ?? []) {
      if (a.required && !attrs[a.fieldKey]) return `« ${a.label} » est obligatoire.`;
    }
    if (publishNow && contactPhone.replace(/\D/g, "").length < 8) {
      return "Un numéro de contact est obligatoire pour publier.";
    }
    return null;
  }

  function reset() {
    setSellerId(""); setSellerQuery(""); setCategoryId("");
    setTitle(""); setDescription(""); setPrice(""); setOnRequest(false);
    setNegotiable(true); setCondition("used"); setGovernorate(GOVERNORATES[0]);
    setAttrs({}); setContactName(""); setContactPhone("");
    setPhotos([]); setFitments([]); setPublishNow(true);
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      toast(problem, "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/annonces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: sellerId,
          category_id: categoryId,
          title: title.trim(),
          description: description.trim() || null,
          price: onRequest ? null : Number(price),
          price_on_request: onRequest,
          negotiable,
          condition,
          governorate,
          attributes: attrs,
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          photos: photos.map((p, i) => ({ storage_path: p.path, sort_order: i })),
          fitments: isPart
            ? fitments
                .filter((f) => f.make.trim())
                .map((f) => ({
                  make: f.make.trim(),
                  model: f.model.trim() || null,
                  year_from: f.yearFrom ? Number(f.yearFrom) : null,
                  year_to: f.yearTo ? Number(f.yearTo) : null,
                }))
            : [],
          publish: publishNow,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? j.error ?? "Échec de la création.", "error");
        return;
      }
      toast(
        publishNow
          ? "Annonce créée et publiée — le vendeur est prévenu."
          : "Annonce créée, en attente de vérification.",
        "success",
      );
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      toast("Erreur réseau.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-2/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            Un vendeur vous a envoyé sa voiture par téléphone ou sur WhatsApp ?
            Publiez-la pour lui — <strong className="text-foreground">sans frais ni forfait</strong>.
          </p>
          <AdminButton variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" /> Créer une annonce
          </AdminButton>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-foreground">Créer une annonce</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Publiée au nom du vendeur, sans frais. La gratuité est enregistrée à votre nom.
          </p>
        </div>
        {!standalone && (
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="mt-4 space-y-4">
        {/* ── Vendeur ── */}
        <div>
          <Label>Vendeur *</Label>
          {seller ? (
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
              <span className="text-[13.5px] font-bold text-foreground">
                {seller.name}
                {seller.phone && <span className="ms-2 font-normal text-muted">{seller.phone}</span>}
              </span>
              <button
                onClick={() => setSellerId("")}
                className="text-[11.5px] font-bold text-muted hover:text-foreground"
              >
                Changer
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={sellerQuery}
                  onChange={(e) => setSellerQuery(e.target.value)}
                  placeholder="Nom ou téléphone…"
                  className={INPUT + " !mt-0 ps-9"}
                />
              </div>
              <ul className="mt-1.5 space-y-1">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => pickSeller(s)}
                      className="w-full rounded-lg px-3 py-2 text-start text-[13px] text-foreground hover:bg-surface-2"
                    >
                      {s.name}
                      {s.phone && <span className="ms-2 text-[11.5px] text-muted">{s.phone}</span>}
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-[12px] text-muted">
                    Aucun compte ne correspond — le vendeur doit d&apos;abord s&apos;inscrire.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        {/* ── Catégorie ── */}
        <label className="block">
          <Label>Catégorie *</Label>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setAttrs({}); }}
            className={INPUT}
          >
            <option value="">—</option>
            {grouped.map(([group, cats]) => (
              <optgroup key={group} label={group}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <Field
          label="Titre *"
          value={title}
          onChange={setTitle}
          placeholder={isPart ? "Plaquettes de frein avant Bosch" : "Renault Clio 5 · 2020"}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prix (TND)" type="number" value={price} onChange={setPrice} disabled={onRequest} />
          <div className="flex items-end gap-4 pb-2">
            <CheckField label="Négociable" checked={negotiable} onChange={setNegotiable} />
            <CheckField label="Prix sur demande" checked={onRequest} onChange={setOnRequest} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>État</Label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={INPUT}>
              <option value="used">Occasion</option>
              <option value="new">Neuf</option>
              <option value="refurbished">Reconditionné</option>
            </select>
          </label>
          <label className="block">
            <Label>Gouvernorat *</Label>
            <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className={INPUT}>
              {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        </div>

        {category && category.attributes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {category.attributes.map((a) => (
              <AttributeField
                key={a.fieldKey}
                attr={a}
                value={attrs[a.fieldKey]}
                onChange={(v) => setAttrs((s) => ({ ...s, [a.fieldKey]: v }))}
              />
            ))}
          </div>
        )}

        <label className="block">
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ce que le vendeur vous a décrit."
            className={INPUT}
          />
        </label>

        {/* ── Photos ──
            The shared uploader: signed URL + plain fetch. The version that
            lived here went through supabase-js, which serialises on the
            per-origin auth Web Lock and left uploads hanging forever. */}
        <div>
          <Label>Photos</Label>
          <div className="mt-1">
            <PhotoUploader photos={photos} onChange={setPhotos} disabled={busy} />
          </div>
        </div>

        {/* ── Compatibilité (pièces) ── */}
        {isPart && (
          <div>
            <Label>Compatible avec</Label>
            <div className="mt-1 space-y-2">
              {fitments.map((f, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input
                    value={f.make} placeholder="Marque"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, make: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.model} placeholder="Modèle"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.yearFrom} placeholder="De" inputMode="numeric"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearFrom: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.yearTo} placeholder="À" inputMode="numeric"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearTo: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <button
                    onClick={() => setFitments((s) => s.filter((_, j) => j !== i))}
                    className="rounded-xl border border-border px-3 text-[12px] font-bold text-muted hover:text-foreground"
                  >
                    Retirer
                  </button>
                </div>
              ))}
              <AdminButton
                variant="ghost"
                onClick={() => setFitments((s) => [...s, { make: "", model: "", yearFrom: "", yearTo: "" }])}
              >
                <Plus className="size-3.5" /> Ajouter un véhicule compatible
              </AdminButton>
            </div>
          </div>
        )}

        {/* ── Contact ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom affiché" value={contactName} onChange={setContactName} placeholder="Karim B." />
          <Field label="Téléphone affiché *" value={contactPhone} onChange={setContactPhone} placeholder="+216 …" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <CheckField label="Publier immédiatement" checked={publishNow} onChange={setPublishNow} />
          <div className="flex items-center gap-2">
            <AdminButton variant="ghost" onClick={() => { reset(); setOpen(false); }}>
              Annuler
            </AdminButton>
            <AdminButton variant="primary" pending={busy} onClick={submit}>
              {publishNow ? "Créer et publier" : "Créer en brouillon"}
            </AdminButton>
          </div>
        </div>
      </div>
    </section>
  );
}
