"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { PhotoUploader, type UploadedPhoto } from "@/components/listing/PhotoUploader";
import { ListingImage } from "@/components/media/ListingImage";
import { SuggestInput } from "@/components/ui/SuggestInput";
import { formatTND, currencyLabel, cn } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import { governorateLabel } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import {
  CAR_MAKES, MOTO_MAKES, PART_BRANDS, FUELS, TRANSMISSIONS, CONDITIONS, CAR_COLORS,
  modelsFor, modelYears, optionLabel,
} from "@/lib/vehicles";
import type { PublishingNote } from "@/lib/publication";
import {
  Car, Wrench, Check, Tag, Camera, Wallet, Phone,
  ClipboardList, Loader2, MapPin, Plus, Trash2, Gift, Ticket, ImageOff, TriangleAlert, KeyRound, Store,
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

/**
 * Every field this form can ask for, by kind.
 *
 * A category change used to wipe the attributes wholesale. But the five
 * vehicle categories — voitures, utilitaires, motos, camions, engins — all ask
 * for exactly these seven things, so switching between them threw away work
 * for no reason and the fields went blank under the seller. Only what the new
 * kind has no field for is dropped now.
 */
const ATTR_KEYS: Record<"vehicle" | "part", readonly string[]> = {
  vehicle: [
    "make", "model", "year", "mileage", "fuel", "transmission", "color",
    // Rental conditions (src/lib/rental.ts) — only filled for a rental shop.
    "rental_deposit", "rental_min_age", "rental_license_years", "rental_km_per_day",
    "rental_availability", "rental_terms",
  ],
  part: ["part_name", "brand", "reference", "quantity"],
};

function keepAttrsFor(
  attrs: Record<string, string>,
  kind: "vehicle" | "part",
): Record<string, string> {
  const keep = new Set(ATTR_KEYS[kind]);
  return Object.fromEntries(Object.entries(attrs).filter(([k]) => keep.has(k)));
}

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



export function PublishWizard({
  categories,
  feeByCategory,
  creditsLeft,
  freeLeft,
  publishing,
  cheapestPlan = null,
  rentalVehicles = false,
  defaultContactName,
  defaultContactPhone,
  initialDraft,
  locale,
}: {
  categories: WizardCategory[];
  feeByCategory: Record<string, number | null>;
  creditsLeft: number;
  /** Publications remaining in this seller's welcome allowance. */
  freeLeft: number;
  /** Per kind: free or not, refused as things stand, and the sentence to show. */
  publishing: Record<"vehicle" | "part", PublishingNote>;
  /** The cheapest shop plan on sale, for the « open a shop » button at the limit. */
  cheapestPlan?: { price: number; days: number } | null;
  /** A vehicle annonce goes to this person's RENTAL shop: priced per day, with conditions. */
  rentalVehicles?: boolean;
  defaultContactName: string;
  defaultContactPhone: string;
  initialDraft: InitialDraft | null;
  locale: string;
}) {
  const d = initialDraft;
  const t = useTranslations("publish.wizard");
  const cur = currencyLabel(locale);
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
  /**
   * Fields the seller asked to be shown, from the "il manque une chose" list.
   * Kept as ids rather than a boolean so only what they actually tapped goes
   * red — and `flaggedNow` drops an id again the moment the field is filled,
   * so the red never outlives the problem.
   */
  const [flagged, setFlagged] = useState<string[]>([]);
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
  // Which half of the segmented control is open. Seeded from the draft so a
  // resumed parts listing does not come back showing the vehicle side.
  const [pickKind, setPickKind] = useState<"vehicle" | "part">(() => {
    const c = categories.find((x) => x.id === (d?.category_id ?? null));
    return c?.kind === "part" ? "part" : "vehicle";
  });

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isPart = category?.kind === "part";
  const isMoto = category?.slug === "motos";
  const fee = categoryId ? feeByCategory[categoryId] ?? null : null;
  const usingCredit = creditsLeft > 0;
  const free = fee != null && fee <= 0;
  // The order the server settles in: a pack credit first, then a category that
  // costs nothing, then the welcome allowance. Mirrored here so the number the
  // seller is shown is the one they will actually be charged.
  const usingWelcome = !usingCredit && !free && fee != null && fee > 0 && freeLeft > 0;
  // Free personal annonces (D-P1) and shop subscriptions say so in their own
  // words, with the room left; a reached limit is a warning, not good news.
  const isRental = rentalVehicles && category != null && !isPart;
  const plan = category ? publishing[category.kind] : null;
  const note = plan?.note ?? null;
  const blocked = plan?.blocked ?? false;
  // Whose limit it is: a shop's plan (or its missing subscription), or a person's.
  const limitScope: "shop" | "personal" =
    plan?.phrase?.key === "quotaShop" || plan?.phrase?.key === "noteNoSubscription" ? "shop" : "personal";

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


  // ─── What is still missing, and where ────────────────────────────────────
  // Each entry knows the section it belongs to, so the dialog can take the
  // seller straight there instead of leaving them to scan the page for it.
  const missing: { label: string; fieldId: string }[] = [];
  if (!categoryId) missing.push({ label: t("missing.category"), fieldId: "f-category" });
  if (photosUploading > 0) {
    missing.push({
      label: t("missing.photosUploading", { count: photosUploading }),
      fieldId: "f-photos",
    });
  } else if (photos.length === 0) {
    missing.push({ label: t("missing.photo"), fieldId: "f-photos" });
  }
  if (categoryId) {
    if (isPart) {
      if (!attrs.part_name?.trim()) {
        missing.push({ label: t("missing.partName"), fieldId: "f-details" });
      }
    } else if (!attrs.make?.trim()) {
      missing.push({ label: t("missing.make"), fieldId: "f-details" });
    } else if (!attrs.model?.trim()) {
      missing.push({ label: t("missing.model"), fieldId: "f-details" });
    } else if (!attrs.year) {
      missing.push({ label: t("missing.year"), fieldId: "f-details" });
    }
  }
  if (title.trim().length < 3) {
    missing.push({ label: t("missing.title"), fieldId: "f-title" });
  }
  if (!onRequest && !(Number(price) > 0)) {
    missing.push({ label: t("missing.price"), fieldId: "f-price" });
  }
  if (contactPhone.replace(/\D/g, "").length < 8) {
    missing.push({ label: t("missing.phone"), fieldId: "f-phone" });
  }
  if (!attested) {
    missing.push({ label: t("missing.attestation"), fieldId: "f-contact" });
  }

  // Red only survives while the field is still empty: fill it and the outline
  // goes on its own, without the seller having to dismiss anything.
  const missingIds = new Set(missing.map((m) => m.fieldId));
  const flaggedNow = new Set(flagged.filter((id) => missingIds.has(id)));

  /** Scroll to whatever is missing and put the cursor in it. */
  function goToField(id: string) {
    // Mark it before scrolling: by the time the smooth scroll lands, the
    // field is already outlined, so it is obvious which one was meant.
    setFlagged((f) => (f.includes(id) ? f : [...f, id]));
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusable = el.querySelector<HTMLElement>("input, select, textarea, button");
    focusable?.focus({ preventScroll: true });
  }

  /**
   * A red outline, for a field the seller asked to be shown and has not filled
   * yet. `outline` rather than a border or ring so nothing moves when it
   * appears — the field is already in view when it turns red.
   */
  function flagCls(id: string) {
    return flaggedNow.has(id)
      ? " outline outline-2 outline-offset-2 outline-danger"
      : "";
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
      toast(j.detail ?? j.error ?? t("errors.save"), "error");
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
        title: t("alert.title", { count: missing.length }),
        body: t("alert.body"),
        items: missing,
        // The dialog can only flash the field for a second, and the seller is
        // watching a smooth scroll while it does. This keeps it outlined in
        // red afterwards, until it is actually filled.
        onJump: (id) => setFlagged((f) => (f.includes(id) ? f : [...f, id])),
        variant: "warning",
        confirmLabel: t("alert.confirm"),
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
        toast(j.detail ?? j.error ?? t("errors.submit"), "error");
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
          {t("done.title")}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {t("done.body")}
          {done.paidWith === "credit" && typeof done.remaining === "number" && (
            <> {t("done.credit", { count: done.remaining })}</>
          )}
          {done.paidWith === "free" && <> {t("done.free")}</>}
          {done.paidWith === "personal_free" && <> {t("done.personalFree")}</>}
          {done.paidWith === "subscription" && <> {t("done.subscription")}</>}
          {done.paidWith === "welcome" && (
            <> {typeof done.remaining === "number" && done.remaining > 0
              ? t("done.welcomeLeft", { count: done.remaining })
              : t("done.welcome")}
            </>
          )}
        </p>
        <button
          onClick={() => router.push("/account/listings" as never)}
          className="batta-btn-luxe tap-target mt-7 inline-flex px-6 py-3 text-[13.5px]"
        >
          {t("done.cta")}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 pb-56 pt-4 lg:px-6 lg:pb-12 lg:pt-8">
      {/* One page, top to bottom. The wizard's five screens hid what the form
          was actually asking for — you could not see that it wanted a photo
          until you had already answered two screens of questions, and going
          back to fix a price meant walking the whole chain again. Publishing a
          classified is a short form; it reads better as one. */}
      <div className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {t("subtitle")}
          </p>
        </div>
        {saved === "saving" && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <Loader2 className="size-3 animate-spin" /> {t("saving")}
          </span>
        )}
        {saved === "ok" && (
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <Check className="size-3" /> {t("saved")}
          </span>
        )}
      </div>

      {resumed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-soft bg-gold-faint px-4 py-3">
          <p className="text-[12.5px] font-semibold text-gold">
            {d?.updated_at
              ? t("resumedOn", {
                  date: formatDate(d.updated_at, locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
                })
              : t("resumed")}
          </p>
          <button
            type="button"
            onClick={startOver}
            className="text-[12px] font-bold text-muted underline hover:text-foreground"
          >
            {t("startOver")}
          </button>
        </div>
      )}

      <div className="mx-auto mt-5 max-w-3xl">
        <div className="space-y-4">
      {/* ── Category ── */}
              <section id="f-category" className={`scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5${flagCls("f-category")}`}>
          <SectionHead icon={Tag} title={t("category.title")} />
          <p className="mt-1 text-[13px] text-muted">
            {t("category.hint")}
          </p>

          {usingWelcome && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
              <Gift className="size-4" />
              {t("category.welcome", { count: freeLeft })}
            </p>
          )}

          {usingCredit && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
              <Ticket className="size-4" />
              {t("category.credits", { count: creditsLeft })}
            </p>
          )}

          {/* Kind first, then the category — two small rows instead of a
              wall of twelve tiles.

              The tiles were the size of buttons you tick, laid out in a grid
              under two headings, which is exactly how a multi-select looks. It
              is one choice. A segmented control says "one of these" the way
              every OS does, and the chips under it are radio buttons in
              everything but paint — so the shape of the control now matches
              what it actually does, in about a fifth of the height. */}
          <div className="mt-4">
            <div
              role="radiogroup"
              aria-label={t("category.kindGroup")}
              className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1"
            >
              {([
                { k: "vehicle" as const, label: t("category.vehicle"), Icon: Car },
                { k: "part" as const, label: t("category.part"), Icon: Wrench },
              ]).map(({ k, label, Icon }) => {
                const on = pickKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setPickKind(k);
                      // Keep a category only while it still belongs to the
                      // kind on screen, or the form asks for a gearbox on a
                      // brake pad.
                      if (category && category.kind !== k) {
                        setCategoryId(null);
                        setAttrs((a) => keepAttrsFor(a, k));
                      }
                    }}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[13.5px] font-bold transition",
                      // Selected = the primary button's own fill. Gold is
                      // reserved for money; a chosen radio is not money.
                      on
                        ? "bg-foreground text-[var(--background)] shadow-[var(--shadow-md)]"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div
              role="radiogroup"
              aria-label={t("category.group")}
              className="mt-2.5 flex flex-wrap gap-1.5"
            >
              {categories
                .filter((c) => c.kind === pickKind)
                .map((c) => {
                  const active = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setCategoryId(c.id);
                        // Voitures → Motos asks for the same seven things, so
                        // clearing the lot cost the seller everything they had
                        // typed. Only what the new kind has no field for goes.
                        setAttrs((a) => keepAttrsFor(a, c.kind === "part" ? "part" : "vehicle"));
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition",
                        active
                          ? "bg-foreground text-[var(--background)]"
                          : "bg-surface-2 text-muted ring-1 ring-border hover:text-foreground",
                      )}
                    >
                      {active && <Check className="size-3.5" />}
                      {c.label}
                    </button>
                  );
                })}
            </div>

            {/* The price of publishing, said once, instead of repeated on
                every tile. */}
            {category && (note || fee != null) && (
              <p
                className={cn(
                  "mt-2.5 inline-flex items-start gap-1.5 text-[12.5px] font-bold",
                  blocked
                    ? "text-[var(--danger)]"
                    : free ? "text-[var(--success,#4ade80)]" : "text-muted",
                )}
              >
                {blocked ? (
                  <><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {note}</>
                ) : note ? (
                  <><Gift className="mt-0.5 size-3.5 shrink-0" /> {note}</>
                ) : free ? (
                  <><Gift className="size-3.5" /> {t("category.free")}</>
                ) : (
                  <>{t("category.fee", { price: formatTND(fee ?? 0, locale), currency: cur })}</>
                )}
              </p>
            )}
            {/* Said here, before the form is filled, and again under the
                button at the end. */}
            {category && blocked && (
              <LimitActions scope={limitScope} cheapestPlan={cheapestPlan} locale={locale} />
            )}
          </div>

        </section>

      {/* ── STEP 2 · Photos ── */}
              <section id="f-photos" className={`scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5${flagCls("f-photos")}`}>
          <SectionHead icon={Camera} title={t("photos.title")} />
          <p className="mt-1 text-[13px] text-muted">
            {t("photos.hint")}
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
              <section id="f-details" className={`scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5${flagCls("f-details")}`}>
          <SectionHead icon={ClipboardList} title={isPart ? t("details.partTitle") : t("details.vehicleTitle")} />
          <p className="mt-1 text-[13px] text-muted">
            {isPart ? t("details.partHint") : t("details.vehicleHint")}
          </p>

          {isPart ? (
            <div className="mt-5 space-y-4">
              <Field
                label={t("details.partName")}
                required
                value={attrs.part_name ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, part_name: v }))}
                placeholder={t("details.partNamePlaceholder")}
              />
              <Picker
                label={t("details.partBrand")}
                value={attrs.brand ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, brand: v }))}
                options={PART_BRANDS}
                placeholder={t("details.partBrandPlaceholder")}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t("details.reference")}
                  value={attrs.reference ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, reference: v }))}
                  placeholder="0986494600"
                  ltr
                />
                <Field
                  label={t("details.quantity")}
                  type="number"
                  value={attrs.quantity ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, quantity: v }))}
                  placeholder="1"
                />
              </div>

              <Chips
                label={t("details.condition")}
                value={condition}
                onChange={setCondition}
                options={CONDITIONS.map((c) => ({ value: c.value, label: t(`options.condition.${c.value}`) }))}
              />

              {/* Compatibility — the query this catalog lives on. */}
              <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5">
                <span className="text-[12px] font-extrabold text-foreground">
                  {t("fitment.title")}
                </span>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {t("fitment.hint")}
                </p>
                <div className="mt-3 space-y-2">
                  {fitments.map((f, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Picker
                        value={f.make}
                        onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, make: v } : x)))}
                        options={CAR_MAKES.map((m) => m.name)}
                        placeholder={t("fitment.make")}
                        compact
                      />
                      <Picker
                        value={f.model}
                        onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, model: v } : x)))}
                        options={modelsFor(f.make)}
                        placeholder={t("fitment.model")}
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => setFitments((s) => s.filter((_, j) => j !== i))}
                        aria-label={t("fitment.remove")}
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
                          placeholder={t("fitment.yearFrom")}
                        />
                        <Field
                          compact
                          type="number"
                          value={f.yearTo}
                          onChange={(v) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearTo: v } : x)))}
                          placeholder={t("fitment.yearTo")}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFitments((s) => [...s, { make: "", model: "", yearFrom: "", yearTo: "" }])}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12.5px] font-bold text-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" /> {t("fitment.add")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Picker
                  label={t("details.make")}
                  required
                  value={attrs.make ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, make: v, model: "" }))}
                  options={makeList.map((m) => m.name)}
                  placeholder="Renault"
                />
                <Picker
                  label={t("details.model")}
                  required
                  value={attrs.model ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, model: v }))}
                  options={models}
                  placeholder={models.length ? t("details.modelPlaceholder") : t("details.pickMakeFirst")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Picker
                  label={t("details.year")}
                  required
                  value={attrs.year ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, year: v }))}
                  options={years.map(String)}
                  placeholder="2019"
                />
                <Field
                  label={t("details.mileage")}
                  type="number"
                  value={attrs.mileage ?? ""}
                  onChange={(v) => setAttrs((s) => ({ ...s, mileage: v }))}
                  placeholder="120000"
                  suffix={t("details.km")}
                />
              </div>

              <Chips
                label={t("details.fuel")}
                value={attrs.fuel ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, fuel: v }))}
                options={FUELS.map((f) => ({ value: f.value, label: t(`options.fuel.${f.value}`) }))}
              />
              <Chips
                label={t("details.transmission")}
                value={attrs.transmission ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, transmission: v }))}
                options={TRANSMISSIONS.map((x) => ({ value: x.value, label: t(`options.transmission.${x.value}`) }))}
              />
              <Chips
                label={t("details.condition")}
                value={condition}
                onChange={setCondition}
                options={CONDITIONS.map((c) => ({ value: c.value, label: t(`options.condition.${c.value}`) }))}
              />
              <ColorPicker
                label={t("details.color")}
                value={attrs.color ?? ""}
                onChange={(v) => setAttrs((s) => ({ ...s, color: v }))}
                otherLabel={t("details.colorOther")}
                otherPlaceholder={t("details.colorOtherPlaceholder")}
                locale={locale}
              />
            </div>
          )}
        </section>

      {/* ── Rental conditions (location_auto only) ──
          Declared by the agency, in words. No booking calendar on purpose
          (brief, recette 3): the renter calls to book, and a calendar the
          agency does not keep up would be a promise we cannot keep. */}
      {isRental && (
        <section id="f-rental" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <SectionHead icon={KeyRound} title={t("rental.title")} />
          <p className="mt-1 text-[13px] text-muted">
            {t("rental.hint")}
          </p>
          <div className="mt-4 space-y-4">
            <Chips
              label={t("rental.availability")}
              value={attrs.rental_availability ?? ""}
              onChange={(v) => setAttrs((s) => ({ ...s, rental_availability: v }))}
              options={[
                { value: "available", label: t("rental.available") },
                { value: "on_request", label: t("rental.onRequest") },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("rental.deposit")} type="number" suffix={cur} compact
                value={attrs.rental_deposit ?? ""} placeholder="500"
                onChange={(v) => setAttrs((s) => ({ ...s, rental_deposit: v }))} />
              <Field label={t("rental.kmIncluded")} type="number" suffix={t("rental.kmPerDay")} compact
                value={attrs.rental_km_per_day ?? ""} placeholder="250"
                onChange={(v) => setAttrs((s) => ({ ...s, rental_km_per_day: v }))} />
              <Field label={t("rental.minAge")} type="number" suffix={t("rental.years")} compact
                value={attrs.rental_min_age ?? ""} placeholder="21"
                onChange={(v) => setAttrs((s) => ({ ...s, rental_min_age: v }))} />
              <Field label={t("rental.licenseYears")} type="number" suffix={t("rental.years")} compact
                value={attrs.rental_license_years ?? ""} placeholder="2"
                onChange={(v) => setAttrs((s) => ({ ...s, rental_license_years: v }))} />
            </div>
            <label className="block">
              <Label>{t("rental.otherTerms")}</Label>
              <textarea
                value={attrs.rental_terms ?? ""}
                onChange={(e) => setAttrs((s) => ({ ...s, rental_terms: e.target.value }))}
                rows={3}
                maxLength={600}
                placeholder={t("rental.otherTermsPlaceholder")}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
              />
            </label>
          </div>
        </section>
      )}

      {/* ── STEP 4 · Price & description ── */}
              <section id="f-price" className={`scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5${flagCls("f-price")}`}>
          <SectionHead icon={Wallet} title={t("price.title")} />
          <p className="mt-1 text-[13px] text-muted">
            {t("price.hint")}
          </p>

          <div className="mt-5 space-y-4">
            <div id="f-title" className={`scroll-mt-24 rounded-xl${flagCls("f-title")}`}>
            <Field
              label={t("price.titleLabel")}
              required
              value={title}
              onChange={setTitle}
              placeholder={isPart ? t("price.titlePlaceholderPart") : t("price.titlePlaceholderVehicle")}
            />
            </div>

            <div>
              <Label>{isRental ? t("price.perDay") : t("price.price")} {!onRequest && <span className="text-gold">*</span>}</Label>
              <div className="relative mt-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={price}
                  disabled={onRequest}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={isRental ? "120" : "45000"}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-3 pe-24 text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted focus:border-gold focus:outline-none disabled:opacity-40"
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-muted">
                  {isRental ? t("price.unitPerDay", { currency: cur }) : cur}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Toggle label={t("price.negotiable")} on={negotiable} onClick={() => setNegotiable((v) => !v)} />
                <Toggle label={t("price.onRequest")} on={onRequest} onClick={() => setOnRequest((v) => !v)} />
              </div>
            </div>

            <div>
              <Label>{t("price.description")}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder={
                  isPart
                    ? t("price.descriptionPlaceholderPart")
                    : t("price.descriptionPlaceholderVehicle")
                }
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
              />
              <p className="mt-1 text-end text-[10.5px] text-muted">{description.length} / 4000</p>
            </div>
          </div>
        </section>

      {/* ── STEP 5 · Contact, preview, publish ── */}
              <section id="f-contact" className={`scroll-mt-24 rounded-2xl border border-border bg-surface p-4 sm:p-5${flagCls("f-contact")}`}>
          <SectionHead icon={Phone} title={t("contact.title")} />
          <p className="mt-1 text-[13px] text-muted">
            {t("contact.hint")}
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("contact.name")} value={contactName} onChange={setContactName} placeholder={t("contact.namePlaceholder")} />
              <div id="f-phone" className={`scroll-mt-24 rounded-xl${flagCls("f-phone")}`}>
                <Field label={t("contact.phone")} required value={contactPhone} onChange={setContactPhone} placeholder="+216 …" type="tel" ltr />
              </div>
            </div>

            <div>
              <Label>{t("contact.governorate")} <span className="text-gold">*</span></Label>
              <div className="relative mt-1">
                <MapPin className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <select
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border bg-surface py-3 ps-9 pe-3 text-[14px] text-foreground focus:border-gold focus:outline-none"
                >
                  {GOVERNORATES.map((g) => <option key={g} value={g}>{governorateLabel(g, locale)}</option>)}
                </select>
              </div>
            </div>

            {/* Preview — the exact card a buyer will see.

                It claimed to be that and was not: a raw <img> contained on
                flat black, so a portrait photo sat in a black slab that looked
                broken, and the browser pulled the full-size original to fill
                180px. ListingImage is what every real card uses — whole photo
                over a blurred fill of itself, resized to the box. */}
            <div>
              <Label>{t("preview.label")}</Label>
              <div className="mt-1 w-[180px] overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-[4/3] bg-surface-2">
                  {photos[0] ? (
                    <ListingImage path={photos[0].path} alt="" sizes="180px" />
                  ) : (
                    <span className="grid size-full place-items-center gap-1 text-center text-muted">
                      <ImageOff className="mx-auto size-5" />
                      <span className="px-2 text-[10px] leading-tight">{t("preview.noPhoto")}</span>
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    {category?.label}
                  </span>
                  <h3 className="mt-0.5 line-clamp-2 text-[12.5px] font-bold leading-snug">{title || "—"}</h3>
                  <p className="batta-tabular mt-1 text-[13px] font-extrabold">
                    {onRequest || !(Number(price) > 0)
                      ? t("preview.onRequest")
                      : `${formatTND(Number(price), locale)} ${cur}${isRental ? ` ${t("preview.perDay")}` : ""}`}
                  </p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
                    <MapPin className="size-2.5" /> {governorateLabel(governorate, locale)}
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
              <span className="text-[12.5px] leading-relaxed text-foreground">{t("attestation")}</span>
            </label>

            <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">
                  {usingCredit
                    ? t("fee.fromPack")
                    : free
                      ? t("fee.publication")
                      : t("fee.fees")}
                </span>
                <span className="batta-tabular text-[18px] font-extrabold text-foreground">
                  {usingCredit
                    ? <span className="ltr-island">1 / {creditsLeft}</span>
                    : fee == null
                      ? "—"
                      : free
                        ? t("fee.free")
                        : `${formatTND(fee, locale)} ${cur}`}
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-[11.5px] leading-snug",
                  blocked ? "font-bold text-[var(--danger)]" : "text-muted",
                )}
              >
                {blocked
                  ? note
                  : usingCredit
                    ? t("fee.packNote")
                    : free
                      ? `${note ?? t("fee.freeDefault")} ${t("fee.straightToReview")}`
                      : t("fee.payNote")}
              </p>
            </div>
          </div>
        </section>

        {/* Everything you need before publishing, at the END of the form.

            It lived in a rail down the right-hand side, and the report was
            "I should be in the bottom man" — which is right. A form is read
            top to bottom and submitted at the end; a panel parked beside it is
            something you have to notice, and the first report about it was
            simply not being able to find the button at all. */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
          {/* A footer, laid out as one: the label and where the seller stands
              on the left, the action on the right, and — only when there is
              something to fix — the list of it under a rule.

              "Tout est prêt" used to be an `inline-flex` pill, which is
              inline-LEVEL, so it ran up beside the "AVANT DE PUBLIER" label as
              if it had landed there by accident, above a button stretched the
              whole width of the column. */}
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 p-4 sm:p-5">
            <div className="min-w-0">
              <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
                {t("footer.before")}
              </span>
              {missing.length === 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-[14.5px] font-extrabold text-foreground">
                  <Check className="size-4 shrink-0 text-[var(--success,#4ade80)]" strokeWidth={3} />
                  {t("footer.ready")}
                </p>
              ) : (
                <p className="mt-1 text-[14.5px] font-extrabold text-foreground">
                  {t("footer.toComplete", { count: missing.length })}
                </p>
              )}
            </div>

            {/* lg only: below that the floating bar carries this button, and
                two "Publier" buttons on one screen is a question, not a
                convenience.

                The `hidden` sits on this WRAPPER, not on the button. It was on
                the button and did nothing: `.batta-btn-luxe` sets
                `display: inline-flex` from globals.css, which is unlayered CSS,
                and unlayered CSS outranks everything in `@layer utilities` —
                so `hidden` lost the cascade to it at every width and both
                buttons showed on every phone. Any display utility on a gold
                button has the same problem; put it on a plain element around
                the button instead. */}
            <div className="hidden shrink-0 lg:block">
            <button
              type="button"
              onClick={publishNow}
              disabled={busy || photosUploading > 0}
              className="batta-btn-luxe tap-target h-11 shrink-0 items-center justify-center gap-1.5 px-7 text-[13.5px] disabled:opacity-60"
            >
              {busy ? (
                <><Loader2 className="size-4 animate-spin" /> {t("cta.busy")}</>
              ) : photosUploading > 0 ? (
                <><Loader2 className="size-4 animate-spin" /> {t("cta.sendingPhotos")}</>
              ) : (
                <>{t("cta.publish")}</>
              )}
            </button>
            </div>
          </div>

          {missing.length > 0 && (
            <ul className="grid border-t border-border p-2 sm:grid-cols-2 sm:p-3">
              {missing.map((m) => (
                <li key={m.label}>
                  <button
                    type="button"
                    onClick={() => goToField(m.fieldId)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start text-[12.5px] transition hover:bg-surface-2",
                      flaggedNow.has(m.fieldId)
                        ? "font-bold text-danger"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        flaggedNow.has(m.fieldId) ? "bg-danger" : "bg-muted",
                      )}
                    />
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(var(--batta-bottombar-h,64px)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={publishNow}
          disabled={busy || photosUploading > 0}
          className="batta-btn-luxe tap-target inline-flex h-12 w-full items-center justify-center gap-1.5 text-[14px] disabled:opacity-60"
        >
          {busy ? (
            <><Loader2 className="size-4 animate-spin" /> {t("cta.busy")}</>
          ) : photosUploading > 0 ? (
            <><Loader2 className="size-4 animate-spin" /> {t("cta.sendingPhotos")}</>
          ) : (
            <>{t("cta.publish")}</>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted lg:mt-3">
          {blocked
            ? t("bar.blocked")
            : free
            ? (note ?? t("category.free"))
            : usingCredit
              ? t("bar.credit", { count: creditsLeft })
              : usingWelcome
                ? t("bar.welcome")
              : fee != null
                ? t("bar.fee", { price: formatTND(fee, locale), currency: cur })
                : t("bar.noCategory")}
        </p>
        {blocked && (
          <div className="flex justify-center">
            <LimitActions scope={limitScope} cheapestPlan={cheapestPlan} locale={locale} />
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * What a seller at the limit can do about it: two buttons, not a sentence to
 * act on alone. A person: open a shop (from the cheapest plan on sale), or make
 * room by withdrawing one of their annonces. A shop: its subscription, or its
 * annonces. The draft is kept either way, and /submit moves a personal draft
 * into the shop once there is one (see `shopForPersonalDraft`).
 */
function LimitActions({
  scope, cheapestPlan, locale,
}: {
  scope: "shop" | "personal";
  cheapestPlan: { price: number; days: number } | null;
  locale: string;
}) {
  const t = useTranslations("publish.wizard.limit");
  const shopLabel = scope === "shop"
    ? t("myPlan")
    : cheapestPlan
      ? t("openShopFrom", {
          price: formatTND(cheapestPlan.price, locale),
          currency: currencyLabel(locale),
          days: cheapestPlan.days,
        })
      : t("openShop");
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Link
        href={scope === "shop" ? "/pro/dashboard/abonnement" : "/pro"}
        className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-4 py-2.5 text-[12.5px]"
      >
        <Store className="size-4 shrink-0" strokeWidth={2.2} />
        {shopLabel}
      </Link>
      <Link
        href={scope === "shop" ? "/pro/dashboard/annonces" : "/account/listings"}
        className="batta-btn-quiet tap-target inline-flex items-center gap-1.5 px-4 py-2.5 text-[12.5px]"
      >
        <ClipboardList className="size-4 shrink-0" strokeWidth={2.2} />
        {t(scope === "shop" ? "shopListings" : "myListings")}
      </Link>
    </div>
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
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted ring-1 ring-border">
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
  label, value, onChange, placeholder, type = "text", required, suffix, compact, ltr,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  suffix?: string;
  compact?: boolean;
  /** A phone number or a reference: typed left to right in Arabic too. */
  ltr?: boolean;
}) {
  return (
    <label className="block">
      {label && <Label>{label} {required && <span className="text-gold">*</span>}</Label>}
      <div className="relative mt-1">
        <input
          type={type}
          inputMode={type === "number" ? "numeric" : type === "tel" ? "tel" : undefined}
          dir={ltr ? "ltr" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-xl border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:border-gold focus:outline-none",
            ltr && "rtl:text-end",
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
  // Its own suggestion list, not a <datalist>: see SuggestInput. The label is
  // a sibling with htmlFor, not a wrapper — inside a <label>, tapping an
  // option would also re-focus the field and reopen the list it just closed.
  return (
    <div className="block">
      {label && (
        <label htmlFor={id}>
          <Label>{label} {required && <span className="text-gold">*</span>}</Label>
        </label>
      )}
      <div className="mt-1">
        <SuggestInput
          id={id}
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder}
          aria-label={label ? undefined : placeholder}
          className={cn(
            "w-full rounded-xl border border-border bg-surface px-3 text-foreground placeholder:text-muted focus:border-gold focus:outline-none",
            compact ? "py-2.5 text-[13.5px]" : "py-3 text-[14px]",
          )}
        />
      </div>
    </div>
  );
}

/**
 * The body colour as swatches: tapped, not typed. Typed, « noir », « Noir »
 * and « nwar » were three different colours to anyone filtering, and the
 * Arabic page could not name any of them. « Autre couleur » keeps free text
 * for the rest (a two-tone, a wrap).
 */
function ColorPicker({
  label, value, onChange, otherLabel, otherPlaceholder, locale,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  otherLabel: string;
  otherPlaceholder: string;
  locale: string;
}) {
  const known = CAR_COLORS.some((c) => c.value === value);
  const [other, setOther] = useState(value !== "" && !known);
  const chip = (on: boolean) =>
    cn(
      "tap-target inline-flex items-center gap-2 rounded-full py-2 ps-2 pe-3.5 text-[13px] font-bold transition",
      on
        ? "bg-foreground text-[var(--background)]"
        : "bg-surface text-muted ring-1 ring-border hover:text-foreground",
    );
  // A grey rim, so black reads on the dark page and white on a selected chip.
  const dot = "size-5 shrink-0 rounded-full ring-1 ring-inset ring-[rgba(128,128,128,0.5)]";
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {CAR_COLORS.map((c) => {
          const on = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setOther(false);
                onChange(on ? "" : c.value);
              }}
              className={chip(on)}
            >
              <span aria-hidden className={dot} style={{ background: c.hex }} />
              {optionLabel(CAR_COLORS, c.value, locale)}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={other}
          onClick={() => {
            setOther(true);
            if (known) onChange("");
          }}
          className={chip(other)}
        >
          <span
            aria-hidden
            className={dot}
            style={{ background: "conic-gradient(#c0262d, #e3b928, #2f6b3a, #1f4fa3, #6d1a2a, #c0262d)" }}
          />
          {otherLabel}
        </button>
      </div>
      {other && (
        <input
          value={known ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder}
          aria-label={otherLabel}
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-[14px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
        />
      )}
    </div>
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
                ? "bg-foreground text-[var(--background)]"
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
        on ? "bg-white/10 text-foreground ring-1 ring-white/20" : "bg-surface text-muted ring-1 ring-border",
      )}
    >
      {on && <Check className="size-3.5" />}
      {label}
    </button>
  );
}
