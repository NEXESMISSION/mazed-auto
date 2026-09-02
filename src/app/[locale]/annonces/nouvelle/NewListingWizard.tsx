"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import {
  AttributeField,
  CheckField,
  Field,
  INPUT,
  Label,
  type ListingAttribute,
} from "@/components/listing/fields";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { withTimeout, isTimeout } from "@/lib/withTimeout";
import { formatTND, cn } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import {
  Car, Wrench, ChevronRight, ChevronLeft, Upload, X, Loader2, Check,
  Ticket, Plus, Trash2,
} from "lucide-react";

/**
 * Publier une annonce — four steps, in the order a seller actually thinks:
 *
 *   1. Quoi ?        the category, which decides every field that follows
 *   2. Détails       title, price, and the attributes THAT category defines
 *                    (+ "compatible avec" for a part — the filter buyers use)
 *   3. Photos        uploaded as they are picked, so step 4 has nothing to wait for
 *   4. Contact       the number the buyer will call, and the attestation
 *
 * The draft is saved to the server at every step, so a dropped connection at
 * the photo stage never costs the details typed two screens earlier.
 *
 * How it gets paid for is NOT decided here: /submit spends a pack credit if the
 * seller has one, otherwise it creates the fee payment. The wizard only reports
 * what happened.
 */

export const SELLER_ATTESTATION_VERSION = "v1";

const ATTESTATION_TEXT =
  "J'atteste sur l'honneur que toutes les informations, photos et documents " +
  "fournis sont exacts, complets et concernent bien cet article. Je suis seul " +
  "responsable de toute information fausse, inexacte ou trompeuse. En cas de " +
  "fausse déclaration, Mazed Auto peut refuser ou retirer l'annonce et " +
  "conserver les frais déjà réglés.";

export type WizardAttribute = ListingAttribute;

export type WizardCategory = {
  id: string;
  slug: string;
  label: string;
  kind: "vehicle" | "part";
  groupLabel: string;
  attributes: WizardAttribute[];
};

type Photo = { path: string; uploading?: boolean };
type Fitment = { make: string; model: string; yearFrom: string; yearTo: string };

const MAX_PHOTOS = 12;
const MAX_PHOTO_MB = 25;

export function NewListingWizard({
  categories,
  feeByCategory,
  creditsLeft,
  defaultContactName,
  defaultContactPhone,
  locale,
}: {
  categories: WizardCategory[];
  feeByCategory: Record<string, number | null>;
  creditsLeft: number;
  defaultContactName: string;
  defaultContactPhone: string;
  locale: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [listingId, setListingId] = useState<string | null>(null);
  const [done, setDone] = useState<null | { paidWith: string; remaining?: number }>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [onRequest, setOnRequest] = useState(false);
  const [negotiable, setNegotiable] = useState(true);
  const [condition, setCondition] = useState<"new" | "used" | "refurbished">("used");
  const [governorate, setGovernorate] = useState<string>(GOVERNORATES[0]);
  const [attrs, setAttrs] = useState<Record<string, string | boolean>>({});
  const [fitments, setFitments] = useState<Fitment[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [contactName, setContactName] = useState(defaultContactName);
  const [contactPhone, setContactPhone] = useState(defaultContactPhone);
  const [whatsapp, setWhatsapp] = useState(defaultContactPhone);
  const [attested, setAttested] = useState(false);

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );
  const isPart = category?.kind === "part";
  const fee = categoryId ? feeByCategory[categoryId] ?? null : null;
  const usingCredit = creditsLeft > 0;

  const grouped = useMemo(() => {
    const m = new Map<string, WizardCategory[]>();
    for (const c of categories) {
      if (!m.has(c.groupLabel)) m.set(c.groupLabel, []);
      m.get(c.groupLabel)!.push(c);
    }
    return [...m.entries()];
  }, [categories]);

  // ─── Persist the draft ────────────────────────────────────────────────────
  async function saveDraft(extra: Record<string, unknown> = {}): Promise<string | null> {
    const body: Record<string, unknown> = {
      id: listingId,
      category_id: categoryId,
      title: title.trim(),
      description: description.trim() || null,
      price: onRequest ? null : Number(price) || 0,
      price_on_request: onRequest,
      negotiable,
      condition,
      governorate,
      attributes: attrs,
      ...extra,
    };
    const res = await fetch("/api/annonces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.detail ?? j.error ?? "Enregistrement impossible.", "error");
      return null;
    }
    const j = (await res.json()) as { id: string };
    setListingId(j.id);
    return j.id;
  }

  // ─── Photos: upload on pick ───────────────────────────────────────────────
  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast(`Maximum ${MAX_PHOTOS} photos.`, "warning");
      return;
    }

    setBusy(true);
    const supabase = getBrowserSupabase();
    try {
      const { data: auth } = await withTimeout(supabase.auth.getUser(), 15_000);
      if (!auth.user) {
        toast("Session expirée — reconnectez-vous.", "error");
        return;
      }
      for (const file of picked.slice(0, room)) {
        if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
          toast(`${file.name} : trop volumineux (max ${MAX_PHOTO_MB} Mo).`, "error");
          continue;
        }
        let out = file;
        try {
          out = await withTimeout(
            compressImage(file, { maxEdge: 1600, quality: 0.8, format: "webp" }),
            45_000,
          );
        } catch {
          out = file;
        }
        const ext = out.name.split(".").pop()?.toLowerCase() || "webp";
        const path = `${auth.user.id}/annonce-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error } = await withTimeout(
          supabase.storage.from("properties").upload(path, out, {
            cacheControl: "3600",
            upsert: false,
            contentType: out.type || "image/webp",
          }),
          120_000,
        );
        if (error) {
          toast(`Échec du téléversement : ${error.message}`, "error");
          continue;
        }
        setPhotos((p) => [...p, { path }]);
      }
    } catch (err) {
      toast(isTimeout(err) ? "Connexion trop lente — réessayez." : "Erreur réseau.", "error");
    } finally {
      setBusy(false);
    }
  }

  // ─── Step gates ───────────────────────────────────────────────────────────
  function step2Error(): string | null {
    if (!title.trim() || title.trim().length < 3) return "Donnez un titre à votre annonce.";
    if (!onRequest && !(Number(price) > 0)) return "Indiquez un prix, ou cochez « prix sur demande ».";
    for (const a of category?.attributes ?? []) {
      if (a.required && !attrs[a.fieldKey]) return `« ${a.label} » est obligatoire.`;
    }
    return null;
  }

  async function goTo(next: 1 | 2 | 3 | 4) {
    if (next > step) {
      if (step === 1 && !categoryId) return toast("Choisissez une catégorie.", "warning");
      if (step === 2) {
        const err = step2Error();
        if (err) return toast(err, "warning");
      }
      if (step === 3 && photos.length === 0) {
        return toast("Ajoutez au moins une photo.", "warning");
      }
      setBusy(true);
      const saved = await saveDraft(
        step === 3
          ? {
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
            }
          : {},
      );
      setBusy(false);
      if (!saved) return;
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function submit() {
    if (!attested) return toast("Cochez l'attestation sur l'honneur.", "warning");
    if (!contactPhone.trim()) return toast("Un numéro de téléphone est obligatoire.", "warning");

    setBusy(true);
    const id = await saveDraft({
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim(),
      contact_whatsapp: whatsapp.trim() || null,
      show_phone: true,
      attestation_version: SELLER_ATTESTATION_VERSION,
      photos: photos.map((p, i) => ({ storage_path: p.path, sort_order: i })),
    });
    if (!id) return setBusy(false);

    const res = await fetch(`/api/annonces/${id}/submit`, { method: "POST" });
    setBusy(false);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.detail ?? j.error ?? "Envoi impossible.", "error");
      return;
    }
    const j = (await res.json()) as {
      status: string; paidWith: string; remaining?: number; paymentId?: string;
    };

    if (j.status === "pending_payment" && j.paymentId) {
      router.push(`/payment/checkout?payment=${j.paymentId}` as never);
      return;
    }
    setDone({ paidWith: j.paidWith, remaining: j.remaining });
  }

  // ─── Sent ─────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)] text-white">
            <Check className="size-7" strokeWidth={2.6} />
          </span>
          <h1 className="mt-4 text-[20px] font-extrabold">Annonce envoyée</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Notre équipe la vérifie avant sa mise en ligne — en général sous 24 h. Vous
            recevrez une notification dès qu&apos;elle est publiée.
          </p>
          {done.paidWith === "credit" && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-1.5 text-[12px] font-bold text-gold ring-1 ring-gold-soft">
              <Ticket className="size-3.5" />
              {done.remaining} publication{(done.remaining ?? 0) > 1 ? "s" : ""} restante
              {(done.remaining ?? 0) > 1 ? "s" : ""}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.push("/account/listings" as never)}
              className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13.5px]"
            >
              Voir mes annonces
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="batta-btn-ghost-gold tap-target w-full px-5 py-3 text-[13.5px]"
            >
              Publier une autre annonce
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
      <Steps current={step} />

      {/* ── 1. Category ── */}
      {step === 1 && (
        <section className="mt-6">
          <h1 className="text-[20px] font-extrabold tracking-tight">Que vendez-vous ?</h1>
          <p className="mt-1 text-[13px] text-muted">
            La catégorie décide des informations demandées ensuite.
          </p>
          <div className="mt-5 space-y-5">
            {grouped.map(([group, items]) => (
              <div key={group}>
                <p className="batta-eyebrow mb-2 inline-flex items-center gap-1.5">
                  {items[0].kind === "part" ? <Wrench className="size-3.5" /> : <Car className="size-3.5" />}
                  {group}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCategoryId(c.id); setAttrs({}); }}
                      className={cn(
                        "rounded-xl border p-3 text-left text-[13px] font-bold transition",
                        categoryId === c.id
                          ? "border-gold bg-gold-faint text-gold"
                          : "border-border bg-surface text-foreground hover:border-gold-soft",
                      )}
                    >
                      {c.label}
                      {feeByCategory[c.id] != null && (
                        <span className="mt-0.5 block text-[10.5px] font-semibold text-muted">
                          {usingCredit
                            ? "1 publication de votre forfait"
                            : (feeByCategory[c.id] as number) <= 0
                              ? "Gratuit"
                              : `${formatTND(feeByCategory[c.id] as number, locale)} TND`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 2. Details ── */}
      {step === 2 && category && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight">{category.label}</h1>
            <p className="mt-1 text-[13px] text-muted">Décrivez ce que vous vendez.</p>
          </div>

          <Field label="Titre" value={title} onChange={setTitle} placeholder={isPart ? "Plaquettes de frein avant Bosch" : "Renault Clio 5 · 2020"} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Prix (TND)"
              type="number"
              value={price}
              onChange={setPrice}
              disabled={onRequest}
            />
            <div className="flex flex-col justify-end gap-2 pb-1">
              <CheckField label="Prix négociable" checked={negotiable} onChange={setNegotiable} />
              <CheckField label="Prix sur demande" checked={onRequest} onChange={setOnRequest} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <Label>État</Label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as "new")} className={INPUT}>
                <option value="new">Neuf</option>
                <option value="used">Occasion</option>
                <option value="refurbished">Reconditionné</option>
              </select>
            </label>
            <label className="block">
              <Label>Gouvernorat</Label>
              <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className={INPUT}>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>

          {category.attributes.length > 0 && (
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
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="État, entretien, raison de la vente…"
              className={INPUT}
            />
          </label>

          {isPart && (
            <FitmentEditor fitments={fitments} setFitments={setFitments} />
          )}
        </section>
      )}

      {/* ── 3. Photos ── */}
      {step === 3 && (
        <section className="mt-6">
          <h1 className="text-[20px] font-extrabold tracking-tight">Photos</h1>
          <p className="mt-1 text-[13px] text-muted">
            La première photo est la couverture. Une annonce avec de vraies photos reçoit
            beaucoup plus d&apos;appels.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <div key={p.path} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={propertyPhotoUrl(p.path)} alt="" className="size-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-white">
                    Couverture
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPhotos((s) => s.filter((_, j) => j !== i))}
                  aria-label="Retirer"
                  className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white hover:bg-black/85"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-gold-soft bg-gold-faint/30 text-gold transition hover:bg-gold-faint/60">
                {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPickPhotos}
                  disabled={busy}
                  className="sr-only"
                />
              </label>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            {photos.length}/{MAX_PHOTOS} · JPG, PNG ou HEIC · max {MAX_PHOTO_MB} Mo par photo
          </p>
        </section>
      )}

      {/* ── 4. Contact + attestation ── */}
      {step === 4 && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight">Comment vous joindre ?</h1>
            <p className="mt-1 text-[13px] text-muted">
              L&apos;acheteur vous appelle directement — Mazed n&apos;intervient pas dans la
              vente. Ce numéro s&apos;affiche sur votre annonce.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom affiché" value={contactName} onChange={setContactName} placeholder="Karim B." />
            <Field label="Téléphone" value={contactPhone} onChange={setContactPhone} placeholder="+216 …" />
          </div>
          <Field label="WhatsApp (optionnel)" value={whatsapp} onChange={setWhatsapp} placeholder="+216 …" />

          <div className="rounded-2xl border border-gold-soft bg-gold-faint/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--gold)]"
              />
              <span className="text-[12.5px] leading-relaxed text-foreground">{ATTESTATION_TEXT}</span>
            </label>
          </div>

          <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">
                {usingCredit
                  ? "Publication depuis votre forfait"
                  : fee != null && fee <= 0
                    ? "Publication"
                    : "Frais de publication"}
              </span>
              <span className="batta-tabular text-[18px] font-extrabold text-foreground">
                {usingCredit
                  ? `1 / ${creditsLeft}`
                  : fee == null
                    ? "—"
                    : fee <= 0
                      ? "Gratuit"
                      : `${formatTND(fee, locale)} TND`}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
              {usingCredit
                ? "Aucun paiement : une publication est décomptée de votre forfait."
                : fee != null && fee <= 0
                  ? "Publication gratuite dans cette catégorie : votre annonce part directement en vérification."
                  : "Vous serez redirigé vers le paiement. L'annonce part en vérification dès la réception du reçu."}
            </p>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <div className="mt-8 flex items-center gap-2 border-t border-border pt-5">
        {step > 1 && (
          <button
            type="button"
            onClick={() => goTo((step - 1) as 1 | 2 | 3)}
            disabled={busy}
            className="tap-target inline-flex h-12 items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-bold text-foreground disabled:opacity-50"
          >
            <ChevronLeft className="size-4" /> Retour
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={() => goTo((step + 1) as 2 | 3 | 4)}
            disabled={busy}
            className="batta-btn-luxe tap-target flex-1 px-5 py-3.5 text-[13.5px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <>Continuer <ChevronRight className="size-4" /></>}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || !attested}
            className="batta-btn-luxe tap-target flex-1 px-5 py-3.5 text-[13.5px] disabled:opacity-50"
          >
            {busy ? <><Loader2 className="size-4 animate-spin" /> Envoi…</> : usingCredit ? "Publier avec mon forfait" : "Payer et publier"}
          </button>
        )}
      </div>
    </main>
  );
}

/* ── bits ──────────────────────────────────────────────────────────────── */

const STEP_LABELS = ["Catégorie", "Détails", "Photos", "Contact"] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Étapes">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const state = n === current ? "active" : n < current ? "done" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold",
                state === "active" && "bg-[var(--gold)] text-white",
                state === "done" && "bg-[var(--success)] text-white",
                state === "todo" && "bg-surface-2 text-muted ring-1 ring-border",
              )}
            >
              {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : n}
            </span>
            <span className={cn("hidden text-[12px] font-bold sm:block", state === "todo" ? "text-muted" : "text-foreground")}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function FitmentEditor({
  fitments, setFitments,
}: {
  fitments: Fitment[];
  setFitments: (f: Fitment[]) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Compatible avec</Label>
          <p className="mt-0.5 text-[11.5px] text-muted">
            C&apos;est ainsi que les acheteurs trouvent votre pièce : « pièces pour ma Clio 5
            de 2020 ».
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFitments([...fitments, { make: "", model: "", yearFrom: "", yearTo: "" }])}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-gold hover:underline"
        >
          <Plus className="size-3.5" /> Ajouter
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {fitments.length === 0 && (
          <p className="text-[12px] text-muted">Aucun véhicule indiqué.</p>
        )}
        {fitments.map((f, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input placeholder="Marque" value={f.make}
              onChange={(e) => setFitments(fitments.map((x, j) => j === i ? { ...x, make: e.target.value } : x))}
              className={INPUT} />
            <input placeholder="Modèle" value={f.model}
              onChange={(e) => setFitments(fitments.map((x, j) => j === i ? { ...x, model: e.target.value } : x))}
              className={INPUT} />
            <input placeholder="De" inputMode="numeric" value={f.yearFrom}
              onChange={(e) => setFitments(fitments.map((x, j) => j === i ? { ...x, yearFrom: e.target.value } : x))}
              className={INPUT} />
            <input placeholder="À" inputMode="numeric" value={f.yearTo}
              onChange={(e) => setFitments(fitments.map((x, j) => j === i ? { ...x, yearTo: e.target.value } : x))}
              className={INPUT} />
            <button
              type="button"
              onClick={() => setFitments(fitments.filter((_, j) => j !== i))}
              aria-label="Retirer"
              className="inline-flex items-center justify-center rounded-lg border border-border text-muted hover:text-[var(--accent-deep)]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
