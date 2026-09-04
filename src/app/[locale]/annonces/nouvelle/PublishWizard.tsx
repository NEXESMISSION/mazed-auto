"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { PhotoUploader, type UploadedPhoto } from "@/components/listing/PhotoUploader";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { formatTND, cn } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import {
  CAR_MAKES, MOTO_MAKES, PART_BRANDS, FUELS, TRANSMISSIONS, CONDITIONS,
  modelsFor, modelYears,
} from "@/lib/vehicles";
import {
  Car, Wrench, Truck, Bike, Tractor, Check, Tag, Camera, Wallet, Phone,
  ClipboardList, Loader2, MapPin, Plus, Trash2, Gift, Ticket, ImageOff,
} from "lucide-react";

/**
 * Publier une annonce — rebuilt.
 *
 * What was wrong with the old wizard was not the number of steps, it was the
 * order and the shape of the work:
 *
 *   • It asked for the CATEGORY, then details, then made you sit through the
 *     photo upload. Photos are the slow part and the part a seller already has
 *     in their hand, so they now start uploading in step 2 and finish in the
 *     background while the rest is typed.
 *   • Make, model and colour were free text. That is exactly how the location
 *     column ended up with "Sahloul" in it and fourteen cars vanished from the
 *     filter. They are pickers now, with free text still allowed for the
 *     genuinely unusual.
 *   • The title was a blank box. Nobody wants to write "Renault Clio 2019" by
 *     hand when they just chose Renault, Clio and 2019 — it is proposed, and
 *     stays editable.
 *   • Errors arrived as toasts that vanished, pointing at no field in
 *     particular. They sit under the field now and the Continue button says
 *     what is missing.
 *   • Nothing showed what the annonce would look like. The last step previews
 *     the exact card a buyer will see.
 *
 * The draft is saved on every step change, so a lost connection costs at most
 * the current screen.
 */

export const SELLER_ATTESTATION_VERSION = "v1";

const ATTESTATION_TEXT =
  "J'atteste sur l'honneur que toutes les informations, photos et documents " +
  "fournis sont exacts, complets et concernent bien cet article. Je suis seul " +
  "responsable de toute information fausse, inexacte ou trompeuse. En cas de " +
  "fausse déclaration, Mazed Auto peut refuser ou retirer l'annonce et " +
  "conserver les frais déjà réglés.";

export type WizardCategory = {
  id: string;
  slug: string;
  label: string;
  kind: "vehicle" | "part";
  groupLabel: string;
};

type Fitment = { make: string; model: string; yearFrom: string; yearTo: string };

/**
 * A draft the seller already started, loaded server-side.
 *
 * Publishing a car is a five-minute job on a phone, and five minutes is long
 * enough for a call to come in, a battery to die, or a back gesture to land by
 * accident. Until now every one of those threw the whole form away — the draft
 * was only written at the moment you pressed Publier, so there was nothing to
 * come back to.
 */
export type InitialDraft = {
  id: string;
  category_id: string | null;
  title: string | null;
  description: string | null;
  price: number | string | null;
  price_on_request: boolean | null;
  negotiable: boolean | null;
  condition: string | null;
  governorate: string | null;
  attributes: Record<string, unknown> | null;
  contact_name: string | null;
  contact_phone: string | null;
  updated_at: string | null;
  photos: { storage_path: string; sort_order: number }[] | null;
  fitments: {
    make: string; model: string | null;
    year_from: number | null; year_to: number | null;
  }[] | null;
};


/** Icon per category slug, falling back by kind. */
function iconFor(slug: string, kind: "vehicle" | "part") {
  if (slug === "motos") return Bike;
  if (slug === "camions") return Truck;
  if (slug === "utilitaires") return Truck;
  if (slug === "engins") return Tractor;
  return kind === "part" ? Wrench : Car;
}

export function PublishWizard({
  categories,
  feeByCategory,
  creditsLeft,
  defaultContactName,
  defaultContactPhone,
  initialDraft,
  locale,
}: {
  categories: WizardCategory[];
  feeByCategory: Record<string, number | null>;
  creditsLeft: number;
  defaultContactName: string;
  defaultContactPhone: string;
  initialDraft: InitialDraft | null;
  locale: string;
}) {
  const d = initialDraft;
  const router = useRouter();
  const { toast, alert } = useToast();

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");
  const [listingId, setListingId] = useState<string | null>(d?.id ?? null);
  const [done, setDone] = useState<null | { paidWith: string; remaining?: number }>(null);

  const [categoryId, setCategoryId] = useState<string | null>(d?.category_id ?? null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>(() =>
    (d?.photos ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((x) => ({ path: x.storage_path })),
  );
  const [photosUploading, setPhotosUploading] = useState(0);
  const [attrs, setAttrs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(d?.attributes ?? {})
        // Migration bookkeeping is not something to put back in a form.
        .filter(([k, v]) => !k.startsWith("_") && v != null)
        .map(([k, v]) => [k, String(v)]),
    ),
  );
  const [fitments, setFitments] = useState<Fitment[]>(() =>
    (d?.fitments ?? []).map((f) => ({
      make: f.make ?? "",
      model: f.model ?? "",
      yearFrom: f.year_from != null ? String(f.year_from) : "",
      yearTo: f.year_to != null ? String(f.year_to) : "",
    })),
  );
  const [typedTitle, setTypedTitle] = useState(d?.title && d.title !== "Brouillon" ? d.title : "");
  const [titleTouched, setTitleTouched] = useState(Boolean(d?.title && d.title !== "Brouillon"));
  const [description, setDescription] = useState(d?.description ?? "");
  const [price, setPrice] = useState(d?.price != null && Number(d.price) > 0 ? String(d.price) : "");
  const [onRequest, setOnRequest] = useState(d?.price_on_request === true);
  const [negotiable, setNegotiable] = useState(d?.negotiable !== false);
  const [condition, setCondition] = useState(d?.condition ?? "used");
  const [governorate, setGovernorate] = useState<string>(d?.governorate ?? GOVERNORATES[0]);
  const [contactName, setContactName] = useState(d?.contact_name ?? defaultContactName);
  const [contactPhone, setContactPhone] = useState(d?.contact_phone ?? defaultContactPhone);
  const [attested, setAttested] = useState(false);
  const [resumed, setResumed] = useState(Boolean(d));

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isPart = category?.kind === "part";
  const isMoto = category?.slug === "motos";
  const fee = categoryId ? feeByCategory[categoryId] ?? null : null;
  const usingCredit = creditsLeft > 0;
  const free = fee != null && fee <= 0;

  const makeList = isMoto ? MOTO_MAKES : CAR_MAKES;
  const models = useMemo(
    () => modelsFor(attrs.make ?? "", isMoto ? "moto" : "car"),
    [attrs.make, isMoto],
  );
  const years = useMemo(() => modelYears(), []);

  // A title nobody should have to type: it is exactly what they just picked.
  // Derived, not stored — the moment the seller edits the box their text wins
  // and the suggestion stops chasing them.
  const suggestedTitle = isPart
    ? [attrs.part_name, attrs.brand].filter(Boolean).join(" · ")
    : [attrs.make, attrs.model, attrs.year].filter(Boolean).join(" ");
  const title = titleTouched ? typedTitle : suggestedTitle;
  const setTitle = (v: string) => { setTitleTouched(true); setTypedTitle(v); };

  const grouped = useMemo(() => {
    const m = new Map<string, WizardCategory[]>();
    for (const c of categories) {
      if (!m.has(c.groupLabel)) m.set(c.groupLabel, []);
      m.get(c.groupLabel)!.push(c);
    }
    return [...m.entries()];
  }, [categories]);

  // ─── What is still missing, and where ────────────────────────────────────
  // Each entry knows the section it belongs to, so the dialog can take the
  // seller straight there instead of leaving them to scan the page for it.
  const missing: { label: string; fieldId: string }[] = [];
  if (!categoryId) missing.push({ label: "Choisissez ce que vous vendez.", fieldId: "f-category" });
  if (photosUploading > 0) {
    missing.push({
      label: `Encore ${photosUploading} photo${photosUploading > 1 ? "s" : ""} en cours d'envoi…`,
      fieldId: "f-photos",
    });
  } else if (photos.length === 0) {
    missing.push({ label: "Ajoutez au moins une photo.", fieldId: "f-photos" });
  }
  if (categoryId) {
    if (isPart) {
      if (!attrs.part_name?.trim()) {
        missing.push({ label: "Indiquez de quelle pièce il s'agit.", fieldId: "f-details" });
      }
    } else if (!attrs.make?.trim()) {
      missing.push({ label: "Choisissez la marque.", fieldId: "f-details" });
    } else if (!attrs.model?.trim()) {
      missing.push({ label: "Choisissez le modèle.", fieldId: "f-details" });
    } else if (!attrs.year) {
      missing.push({ label: "Indiquez l'année.", fieldId: "f-details" });
    }
  }
  if (title.trim().length < 3) {
    missing.push({ label: "Donnez un titre à votre annonce.", fieldId: "f-title" });
  }
  if (!onRequest && !(Number(price) > 0)) {
    missing.push({ label: "Indiquez un prix, ou cochez « prix sur demande ».", fieldId: "f-price" });
  }
  if (contactPhone.replace(/\D/g, "").length < 8) {
    missing.push({ label: "Un numéro joignable est obligatoire.", fieldId: "f-phone" });
  }
  if (!attested) {
    missing.push({ label: "Cochez l'attestation pour publier.", fieldId: "f-contact" });
  }

  /** Scroll to whatever is missing and put the cursor in it. */
  function goToField(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusable = el.querySelector<HTMLElement>("input, select, textarea, button");
    focusable?.focus({ preventScroll: true });
  }

  /**
   * Abandon the resumed draft and start clean. The row is left alone rather
   * than deleted — it costs nothing, and a seller who clicks this by mistake
   * has not lost the photos they already uploaded.
   */
  function startOver() {
    setResumed(false);
    setListingId(null);
    setCategoryId(null);
    setPhotos([]);
    setAttrs({});
    setFitments([]);
    setTypedTitle("");
    setTitleTouched(false);
    setDescription("");
    setPrice("");
    setOnRequest(false);
    setNegotiable(true);
    setCondition("used");
    setGovernorate(GOVERNORATES[0]);
    setContactName(defaultContactName);
    setContactPhone(defaultContactPhone);
    setAttested(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  async function saveDraft(extra: Record<string, unknown> = {}): Promise<string | null> {
    setSaved("saving");
    const res = await fetch("/api/annonces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: listingId,
        category_id: categoryId,
        title: title.trim() || "Brouillon",
        description: description.trim() || null,
        price: onRequest ? null : Number(price) || 0,
        price_on_request: onRequest,
        negotiable,
        condition,
        governorate,
        attributes: attrs,
        photos: photos.map((p, i) => ({ storage_path: p.path, sort_order: i })),
        ...extra,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.detail ?? j.error ?? "Enregistrement impossible.", "error");
      setSaved("idle");
      return null;
    }
    const j = (await res.json()) as { id: string };
    setListingId(j.id);
    setSaved("ok");
    return j.id;
  }

  // ─── Autosave ─────────────────────────────────────────────────────────────
  // The draft used to be written only at the moment you pressed Publier, so
  // anything short of finishing was lost. It now saves itself a second and a
  // half after you stop typing, from the moment there is a category to hang the
  // row on. The indicator stays quiet on purpose: a spinner firing on every
  // keystroke is worse than no feedback at all.
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!categoryId) return;
    // Nothing to write on the first render of a resumed draft: the form and
    // the row already agree.
    if (firstRun.current) {
      firstRun.current = false;
      if (d) return;
    }
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => { void saveDraft(); }, 1500);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
    // saveDraft closes over all of these; listing them is what restarts the
    // timer on each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categoryId, photos, attrs, fitments, typedTitle, titleTouched, description,
    price, onRequest, negotiable, condition, governorate, contactName, contactPhone,
  ]);

  async function publishNow() {
    if (missing.length > 0) {
      // Centred, over everything, and every line is a shortcut to the field.
      // The old list sat at the bottom of a long page: you pressed Publier,
      // nothing appeared to happen, and the reason was below the fold.
      alert({
        title:
          missing.length === 1
            ? "Il manque une chose"
            : `Il manque ${missing.length} choses`,
        body: "Touchez une ligne pour aller directement au champ concerné.",
        items: missing,
        variant: "warning",
        confirmLabel: "Corriger",
      });
      return;
    }
    return publish();
  }

  async function publish() {
    setBusy(true);
    try {
      const id = await saveDraft({
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim(),
        contact_whatsapp: contactPhone.trim(),
        show_phone: true,
        attestation_version: SELLER_ATTESTATION_VERSION,
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
      });
      if (!id) return;

      const res = await fetch(`/api/annonces/${id}/submit`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        status?: string; paidWith?: string; remaining?: number;
        paymentId?: string; error?: string; detail?: string;
      };
      if (!res.ok) {
        toast(j.detail ?? j.error ?? "Envoi impossible.", "error");
        return;
      }
      if (j.status === "pending_payment" && j.paymentId) {
        router.push(`/payment/checkout?payment=${j.paymentId}` as never);
        return;
      }
      setDone({ paidWith: j.paidWith ?? "free", remaining: j.remaining });
    } finally {
      setBusy(false);
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-gold-faint text-gold ring-1 ring-gold-soft">
          <Check className="size-8" strokeWidth={2.6} />
        </span>
        <h1 className="mt-5 text-[22px] font-extrabold tracking-tight">
          Annonce envoyée
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Notre équipe la vérifie avant publication — généralement en moins de
          24 h. Vous serez prévenu dès qu&apos;elle est en ligne.
          {done.paidWith === "credit" && typeof done.remaining === "number" && (
            <> Il vous reste {done.remaining} publication{done.remaining > 1 ? "s" : ""}.</>
          )}
          {done.paidWith === "free" && <> La publication était gratuite dans cette catégorie.</>}
        </p>
        <button
          onClick={() => router.push("/account/listings" as never)}
          className="batta-btn-luxe tap-target mt-7 inline-flex px-6 py-3 text-[13.5px]"
        >
          Voir mes annonces
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 pb-32 pt-4 lg:px-6 lg:pb-12 lg:pt-8">
      {/* One page, top to bottom. The wizard's five screens hid what the form
          was actually asking for — you could not see that it wanted a photo
          until you had already answered two screens of questions, and going
          back to fix a price meant walking the whole chain again. Publishing a
          classified is a short form; it reads better as one. */}
      <div className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Publier une annonce</h1>
          <p className="mt-1 text-[13px] text-muted">
            Quelques informations, des photos, votre numéro — c&apos;est tout.
          </p>
        </div>
        {saved === "saving" && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <Loader2 className="size-3 animate-spin" /> Enregistrement…
          </span>
        )}
        {saved === "ok" && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <Check className="size-3" /> Brouillon enregistré
          </span>
        )}
      </div>

      {resumed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-soft bg-gold-faint px-4 py-3">
          <p className="text-[12.5px] font-semibold text-gold">
            Nous avons repris votre brouillon
            {d?.updated_at ? ` du ${new Date(d.updated_at).toLocaleDateString("fr-FR")}` : ""}.
          </p>
          <button
            type="button"
            onClick={startOver}
            className="text-[12px] font-bold text-muted underline hover:text-foreground"
          >
            Recommencer à zéro
          </button>
        </div>
      )}

      <div className="mt-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-7">
        <div className="space-y-4">
      {/* ── Category ── */}
              <section id="f-category" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={Tag} title="Que vendez-vous ?" />
          <p className="mt-1 text-[13px] text-muted">
            Cela décide des informations qui vous seront demandées.
          </p>

          {usingCredit && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
              <Ticket className="size-4" />
              {creditsLeft} publication{creditsLeft > 1 ? "s" : ""} dans votre forfait
            </p>
          )}

          {grouped.map(([group, cats]) => (
            <div key={group} className="mt-6">
              <span className="batta-eyebrow">{group}</span>
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {cats.map((c) => {
                  const Icon = iconFor(c.slug, c.kind);
                  const f = feeByCategory[c.id];
                  const active = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCategoryId(c.id); setAttrs({}); }}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition",
                        active
                          ? "border-gold bg-gold-faint"
                          : "border-border bg-surface hover:border-gold-soft",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 place-items-center rounded-xl",
                          active ? "bg-[var(--gold)] text-black" : "bg-surface-2 text-muted",
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <span className={cn("text-[13.5px] font-bold", active ? "text-gold" : "text-foreground")}>
                        {c.label}
                      </span>
                      {f != null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10.5px] font-bold",
                            f <= 0 ? "text-[var(--success,#4ade80)]" : "text-muted",
                          )}
                        >
                          {f <= 0 ? <><Gift className="size-3" /> Gratuit</> : `${formatTND(f, locale)} TND`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

      {/* ── STEP 2 · Photos ── */}
              <section id="f-photos" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={Camera} title="Vos photos" />
          <p className="mt-1 text-[13px] text-muted">
            Elles décident si un acheteur clique. Montrez l&apos;avant, l&apos;arrière,
            les côtés, l&apos;intérieur et le compteur.
          </p>
          <div className="mt-5">
            <PhotoUploader
              photos={photos}
              onChange={setPhotos}
              onPendingChange={setPhotosUploading}
            />
          </div>
        </section>

      {/* ── STEP 3 · Details ── */}
              <section id="f-details" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={ClipboardList} title={isPart ? "La pièce" : "Le véhicule"} />
          <p className="mt-1 text-[13px] text-muted">
            {isPart
              ? "Plus c'est précis, moins vous recevrez d'appels pour rien."
              : "Ces informations servent aux filtres de recherche."}
          </p>

          {isPart ? (
            <div className="mt-5 space-y-4">
              <Field
                label="De quelle pièce s'agit-il ?"
                required
                value={attrs.part_name ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, part_name: v }))}
                placeholder="Plaquettes de frein avant"
              />
              <Picker
                label="Marque de la pièce"
                value={attrs.brand ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, brand: v }))}
                options={PART_BRANDS}
                placeholder="Bosch, Valeo…"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Référence"
                  value={attrs.reference ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, reference: v }))}
                  placeholder="0986494600"
                />
                <Field
                  label="Quantité"
                  type="number"
                  value={attrs.quantity ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, quantity: v }))}
                  placeholder="1"
                />
              </div>

              <Chips
                label="État"
                value={condition}
                onChange={setCondition}
                options={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
              />

              {/* Compatibility — the query this catalog lives on. */}
              <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5">
                <span className="text-[12px] font-extrabold text-foreground">
                  Compatible avec
                </span>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  C&apos;est ainsi qu&apos;un acheteur trouve votre pièce en cherchant
                  « pour ma Clio 5 de 2020 ».
                </p>
                <div className="mt-3 space-y-2">
                  {fitments.map((f, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Picker
                        value={f.make}
                        onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, make: v } : x)))}
                        options={CAR_MAKES.map((m) => m.name)}
                        placeholder="Marque"
                        compact
                      />
                      <Picker
                        value={f.model}
                        onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, model: v } : x)))}
                        options={modelsFor(f.make)}
                        placeholder="Modèle"
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => setFitments((s) => s.filter((_, j) => j !== i))}
                        aria-label="Retirer"
                        className="grid size-11 place-items-center rounded-xl border border-border text-muted hover:text-foreground"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        <Field
                          compact
                          type="number"
                          value={f.yearFrom}
                          onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearFrom: v } : x)))}
                          placeholder="De (année)"
                        />
                        <Field
                          compact
                          type="number"
                          value={f.yearTo}
                          onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearTo: v } : x)))}
                          placeholder="À (année)"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFitments((s) => [...s, { make: "", model: "", yearFrom: "", yearTo: "" }])}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12.5px] font-bold text-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" /> Ajouter un véhicule compatible
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Picker
                  label="Marque"
                  required
                  value={attrs.make ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, make: v, model: "" }))}
                  options={makeList.map((m) => m.name)}
                  placeholder="Renault"
                />
                <Picker
                  label="Modèle"
                  required
                  value={attrs.model ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, model: v }))}
                  options={models}
                  placeholder={models.length ? "Clio" : "Choisissez la marque"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Picker
                  label="Année"
                  required
                  value={attrs.year ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, year: v }))}
                  options={years.map(String)}
                  placeholder="2019"
                />
                <Field
                  label="Kilométrage"
                  type="number"
                  value={attrs.mileage ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, mileage: v }))}
                  placeholder="120000"
                  suffix="km"
                />
              </div>

              <Chips
                label="Carburant"
                value={attrs.fuel ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, fuel: v }))}
                options={FUELS.map((f) => ({ value: f.value, label: f.label }))}
              />
              <Chips
                label="Boîte"
                value={attrs.transmission ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, transmission: v }))}
                options={TRANSMISSIONS.map((t) => ({ value: t.value, label: t.label }))}
              />
              <Chips
                label="État"
                value={condition}
                onChange={setCondition}
                options={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
              />
              <Field
                label="Couleur"
                value={attrs.color ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, color: v }))}
                placeholder="Blanc"
              />
            </div>
          )}
        </section>

      {/* ── STEP 4 · Price & description ── */}
              <section id="f-price" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={Wallet} title="Titre et prix" />
          <p className="mt-1 text-[13px] text-muted">
            Le titre est proposé d&apos;après ce que vous avez saisi — modifiez-le si
            vous voulez.
          </p>

          <div className="mt-5 space-y-4">
            <div id="f-title" className="scroll-mt-24">
            <Field
              label="Titre de l'annonce"
              required
              value={title}
              onChange={setTitle}
              placeholder={isPart ? "Plaquettes de frein avant · Bosch" : "Renault Clio 2019"}
            />
            </div>

            <div>
              <Label>Prix {!onRequest && <span className="text-gold">*</span>}</Label>
              <div className="relative mt-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={price}
                  disabled={onRequest}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="45000"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-3 pe-16 text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted focus:border-gold focus:outline-none disabled:opacity-40"
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted">
                  TND
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Toggle label="Négociable" on={negotiable} onClick={() => setNegotiable((v) => !v)} />
                <Toggle label="Prix sur demande" on={onRequest} onClick={() => setOnRequest((v) => !v)} />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder={
                  isPart
                    ? "État, provenance, garantie, ce qui est inclus…"
                    : "Entretien, équipements, ce qu'il y a à refaire. Soyez honnête : c'est ce qui évite les visites pour rien."
                }
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
              />
              <p className="mt-1 text-end text-[10.5px] text-muted">{description.length} / 4000</p>
            </div>
          </div>
        </section>

      {/* ── STEP 5 · Contact, preview, publish ── */}
              <section id="f-contact" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={Phone} title="Contact et publication" />
          <p className="mt-1 text-[13px] text-muted">
            Les acheteurs vous appellent directement sur ce numéro.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom affiché" value={contactName} onChange={setContactName} placeholder="Karim B." />
              <div id="f-phone" className="scroll-mt-24">
                <Field label="Téléphone" required value={contactPhone} onChange={setContactPhone} placeholder="+216 …" />
              </div>
            </div>

            <div>
              <Label>Gouvernorat <span className="text-gold">*</span></Label>
              <div className="relative mt-1">
                <MapPin className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <select
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border bg-surface py-3 ps-9 pe-3 text-[14px] text-foreground focus:border-gold focus:outline-none"
                >
                  {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {/* Preview — the exact card a buyer will see. */}
            <div>
              <Label>Aperçu</Label>
              <div className="mt-1 w-[180px] overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-[4/3] bg-black">
                  {photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={propertyPhotoUrl(photos[0].path)} alt="" className="size-full object-contain" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                  )}
                </div>
                <div className="p-2.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    {category?.label}
                  </span>
                  <h3 className="mt-0.5 line-clamp-2 text-[12.5px] font-bold leading-snug">{title || "—"}</h3>
                  <p className="batta-tabular mt-1 text-[13px] font-extrabold">
                    {onRequest || !(Number(price) > 0)
                      ? "Sur demande"
                      : `${formatTND(Number(price), locale)} TND`}
                  </p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
                    <MapPin className="size-2.5" /> {governorate}
                  </p>
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-2/40 p-3.5">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--gold)]"
              />
              <span className="text-[12.5px] leading-relaxed text-foreground">{ATTESTATION_TEXT}</span>
            </label>

            <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">
                  {usingCredit
                    ? "Publication depuis votre forfait"
                    : free
                      ? "Publication"
                      : "Frais de publication"}
                </span>
                <span className="batta-tabular text-[18px] font-extrabold text-foreground">
                  {usingCredit
                    ? `1 / ${creditsLeft}`
                    : fee == null
                      ? "—"
                      : free
                        ? "Gratuit"
                        : `${formatTND(fee, locale)} TND`}
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
                {usingCredit
                  ? "Aucun paiement : une publication est décomptée de votre forfait."
                  : free
                    ? "Gratuit dans cette catégorie : votre annonce part directement en vérification."
                    : "Vous serez redirigé vers le paiement. L'annonce part en vérification dès la réception du reçu."}
              </p>
            </div>
          </div>
        </section>

        </div>

        {/* What is left, what it costs, and the button — beside the form on
            desktop, so the seller never scrolls to find out where they stand.
            The numbered headings this replaces implied an order the form does
            not actually have: you can fill it in any sequence you like. */}
        <aside className="mt-4 hidden lg:mt-0 lg:block">
          <div className="sticky top-[calc(var(--desktop-nav-h,64px)+1rem)] space-y-3 rounded-2xl border border-border bg-surface p-4">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Avant de publier
            </span>

            {missing.length === 0 ? (
              <p className="inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
                <Check className="size-4" /> Tout est prêt.
              </p>
            ) : (
              <ul className="space-y-1">
                {missing.map((m) => (
                  <li key={m.label}>
                    <button
                      type="button"
                      onClick={() => goToField(m.fieldId)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start text-[12.5px] text-muted transition hover:bg-surface-2 hover:text-foreground"
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-muted">
                  {usingCredit ? "Depuis votre forfait" : free ? "Publication" : "Frais"}
                </span>
                <span className="batta-tabular text-[16px] font-extrabold text-foreground">
                  {usingCredit
                    ? `1 / ${creditsLeft}`
                    : fee == null
                      ? "—"
                      : free
                        ? "Gratuit"
                        : `${formatTND(fee, locale)} TND`}
                </span>
              </div>
              <button
                type="button"
                onClick={publishNow}
                disabled={busy || photosUploading > 0}
                className="batta-btn-luxe tap-target mt-3 inline-flex h-12 w-full items-center justify-center gap-1.5 text-[14px] disabled:opacity-60"
              >
                {busy ? (
                  <><Loader2 className="size-4 animate-spin" /> Un instant…</>
                ) : photosUploading > 0 ? (
                  <><Loader2 className="size-4 animate-spin" /> Envoi des photos…</>
                ) : (
                  <>Publier mon annonce</>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(var(--batta-bottombar-h,64px)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={publishNow}
          disabled={busy || photosUploading > 0}
          className="batta-btn-luxe tap-target inline-flex h-12 w-full items-center justify-center gap-1.5 text-[14px] disabled:opacity-60"
        >
          {busy ? (
            <><Loader2 className="size-4 animate-spin" /> Un instant…</>
          ) : photosUploading > 0 ? (
            <><Loader2 className="size-4 animate-spin" /> Envoi des photos…</>
          ) : (
            <>Publier mon annonce</>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted lg:mt-3">
          {free
            ? "Publication gratuite dans cette catégorie."
            : usingCredit
              ? `Utilise 1 de vos ${creditsLeft} publications.`
              : fee != null
                ? `${fee} TND — à régler après vérification.`
                : "Le prix de publication s'affiche dès que la catégorie est choisie."}
        </p>
      </div>
    </main>
  );
}

/* ── Small building blocks ────────────────────────────────────────────────── */

/**
 * A section header: an icon and a title.
 *
 * It used to be a gold circle with a number in it. Numbering implied an order
 * the form does not have — you can fill these in any sequence — and five
 * numbered blocks down one column read as a checklist someone else wrote
 * rather than as a form you are filling in.
 */
function SectionHead({
  icon: Icon, title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gold-faint text-gold ring-1 ring-gold-soft">
        <Icon className="size-4" />
      </span>
      {title}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", required, suffix, compact,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <label className="block">
      {label && <Label>{label} {required && <span className="text-gold">*</span>}</Label>}
      <div className="relative mt-1">
        <input
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-xl border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:border-gold focus:outline-none",
            compact ? "py-2.5 text-[13.5px]" : "py-3 text-[14px]",
            suffix ? "pe-12" : "",
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-muted">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

/**
 * A field with suggestions that still accepts anything typed.
 *
 * `<datalist>` rather than a custom dropdown on purpose: it is native on every
 * phone, needs no keyboard handling of ours, and — the point — does not stop a
 * seller entering the make we forgot.
 */
function Picker({
  label, value, onChange, options, placeholder, required, compact,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <label className="block">
      {label && <Label>{label} {required && <span className="text-gold">*</span>}</Label>}
      <input
        list={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-1 w-full rounded-xl border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:border-gold focus:outline-none",
          compact ? "py-2.5 text-[13.5px]" : "py-3 text-[14px]",
        )}
      />
      <datalist id={id}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}

function Chips({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(value === o.value ? "" : o.value)}
            className={cn(
              "tap-target rounded-full px-4 py-2 text-[13px] font-bold transition",
              value === o.value
                ? "bg-[var(--gold)] text-black"
                : "bg-surface text-muted ring-1 ring-border hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition",
        on ? "bg-gold-faint text-gold ring-1 ring-gold-soft" : "bg-surface text-muted ring-1 ring-border",
      )}
    >
      {on && <Check className="size-3.5" />}
      {label}
    </button>
  );
}
