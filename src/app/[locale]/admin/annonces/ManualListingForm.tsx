"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { GOVERNORATES } from "@/lib/governorates";
import { governorateLabel } from "@/lib/labels";
import { currencyLabel } from "@/lib/utils";
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

/** Below this, the picker stays empty rather than listing the database. */
const MIN_SELLER_CHARS = 2;


export function ManualListingForm({
  categories,
  /**
   * On its own page (`/admin/annonces/nouvelle`) the form is the whole point,
   * so it opens expanded and drops the collapse control. Inline — where it
   * still has to share a screen — it stays a teaser until asked for.
   */
  standalone = false,
  maxPhotos = 12,
}: {
  categories: AdminCategory[];
  standalone?: boolean;
  /** How many photos an annonce may carry (Réglages, D-B5). */
  maxPhotos?: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("adminOps");
  const locale = useLocale();

  const [open, setOpen] = useState(standalone);
  const [busy, setBusy] = useState(false);

  const [sellerQuery, setSellerQuery] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [picked, setPicked] = useState<AdminSeller | null>(null);
  const [matches, setMatches] = useState<AdminSeller[]>([]);
  const [searching, setSearching] = useState(false);
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

  const seller = picked;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const isPart = category?.kind === "part";

  /**
   * Sellers come from the server, two characters at a time.
   *
   * This used to receive every profile as a prop and filter in the browser,
   * which listed all of them before anything was typed — fine at 23 accounts,
   * unusable at 5 000, and it cost a 500-row query on every page load. Below
   * MIN_SELLER_CHARS nothing is fetched and nothing is shown: an empty box is
   * a clearer instruction than a wall of names.
   */
  useEffect(() => {
    const q = sellerQuery.trim();
    if (q.length < MIN_SELLER_CHARS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronising with an external system, which is what an effect is for.
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/vendeurs/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("search_failed");
        const data = (await res.json()) as { sellers: AdminSeller[] };
        setMatches(data.sellers ?? []);
      } catch (e) {
        // An aborted request is the previous keystroke being superseded, not a
        // failure — showing "aucun résultat" for it would flicker on every key.
        if ((e as Error).name !== "AbortError") setMatches([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [sellerQuery]);

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
    setPicked(s);
    setSellerQuery("");
    setMatches([]);
    // Prefill from the profile, then let the admin override: the number the
    // seller wants on the annonce is often not the one on their account.
    if (!contactName) setContactName(s.name);
    if (!contactPhone && s.phone) setContactPhone(s.phone);
  }

  function validate(): string | null {
    if (!sellerId) return t("create.errors.noSeller");
    if (!categoryId) return t("create.errors.noCategory");
    if (title.trim().length < 3) return t("create.errors.noTitle");
    if (!onRequest && !(Number(price) > 0)) {
      return t("create.errors.noPrice");
    }
    for (const a of category?.attributes ?? []) {
      if (a.required && !attrs[a.fieldKey]) return t("create.errors.required", { label: a.label });
    }
    if (publishNow && contactPhone.replace(/\D/g, "").length < 8) {
      return t("create.errors.noPhone");
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
        toast(j.detail ?? j.error ?? t("create.errors.failed"), "error");
        return;
      }
      toast(publishNow ? t("create.done.published") : t("create.done.draft"), "success");
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      toast(t("create.errors.network"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-2/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            {t.rich("create.teaser", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
          </p>
          <AdminButton variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" /> {t("create.title")}
          </AdminButton>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-foreground">{t("create.title")}</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {t("create.subtitle")}
          </p>
        </div>
        {!standalone && (
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="mt-4 space-y-4">
        {/* ── Vendeur ── */}
        <div>
          <Label>{t("create.seller")}</Label>
          {seller ? (
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
              <span className="text-[13.5px] font-bold text-foreground">
                {seller.name}
                {seller.phone && <span className="ltr-island ltr:ml-2 rtl:mr-2 font-normal text-muted">{seller.phone}</span>}
              </span>
              <button
                onClick={() => setSellerId("")}
                className="text-[11.5px] font-bold text-muted hover:text-foreground"
              >
                {t("create.change")}
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={sellerQuery}
                  onChange={(e) => setSellerQuery(e.target.value)}
                  placeholder={t("create.sellerSearch")}
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
                      {s.phone && <span className="ltr-island ltr:ml-2 rtl:mr-2 text-[11.5px] text-muted">{s.phone}</span>}
                    </button>
                  </li>
                ))}

                {/* Three states, because "nothing listed" means three different
                    things and only one of them is a problem. */}
                {sellerQuery.trim().length < MIN_SELLER_CHARS ? (
                  <li className="px-3 py-2 text-[12px] text-muted">
                    {t("create.typeMore", { min: MIN_SELLER_CHARS })}
                  </li>
                ) : searching ? (
                  <li className="px-3 py-2 text-[12px] text-muted">{t("create.searching")}</li>
                ) : matches.length === 0 ? (
                  <li className="px-3 py-2 text-[12px] text-muted">
                    {t("create.noSeller")}
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </div>

        {/* ── Catégorie ── */}
        <label className="block">
          <Label>{t("create.category")}</Label>
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
          label={t("create.titleLabel")}
          value={title}
          onChange={setTitle}
          placeholder={isPart ? t("create.titlePart") : t("create.titleCar")}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("create.price", { currency: currencyLabel(locale) })} type="number" value={price} onChange={setPrice} disabled={onRequest} />
          <div className="flex items-end gap-4 pb-2">
            <CheckField label={t("create.negotiable")} checked={negotiable} onChange={setNegotiable} />
            <CheckField label={t("create.priceOnRequest")} checked={onRequest} onChange={setOnRequest} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("create.condition")}</Label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={INPUT}>
              <option value="used">{t("conditions.used")}</option>
              <option value="new">{t("conditions.new")}</option>
              <option value="refurbished">{t("conditions.refurbished")}</option>
            </select>
          </label>
          <label className="block">
            <Label>{t("create.governorate")}</Label>
            <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className={INPUT}>
              {GOVERNORATES.map((g) => <option key={g} value={g}>{governorateLabel(g, locale)}</option>)}
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
          <Label>{t("create.description")}</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("create.descriptionPlaceholder")}
            className={INPUT}
          />
        </label>

        {/* ── Photos ──
            The shared uploader: signed URL + plain fetch. The version that
            lived here went through supabase-js, which serialises on the
            per-origin auth Web Lock and left uploads hanging forever. */}
        <div>
          <Label>{t("create.photos")}</Label>
          <div className="mt-1">
            <PhotoUploader photos={photos} onChange={setPhotos} disabled={busy} max={maxPhotos} />
          </div>
        </div>

        {/* ── Compatibilité (pièces) ── */}
        {isPart && (
          <div>
            <Label>{t("create.fitment")}</Label>
            <div className="mt-1 space-y-2">
              {fitments.map((f, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input
                    value={f.make} placeholder={t("create.make")}
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, make: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.model} placeholder={t("create.model")}
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.yearFrom} placeholder={t("create.yearFrom")} inputMode="numeric"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearFrom: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <input
                    value={f.yearTo} placeholder={t("create.yearTo")} inputMode="numeric"
                    onChange={(e) => setFitments((s) => s.map((x, j) => (j === i ? { ...x, yearTo: e.target.value } : x)))}
                    className={INPUT + " !mt-0"} />
                  <button
                    onClick={() => setFitments((s) => s.filter((_, j) => j !== i))}
                    className="rounded-xl border border-border px-3 text-[12px] font-bold text-muted hover:text-foreground"
                  >
                    {t("create.remove")}
                  </button>
                </div>
              ))}
              <AdminButton
                variant="ghost"
                onClick={() => setFitments((s) => [...s, { make: "", model: "", yearFrom: "", yearTo: "" }])}
              >
                <Plus className="size-3.5" /> {t("create.addFitment")}
              </AdminButton>
            </div>
          </div>
        )}

        {/* ── Contact ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("create.contactName")} value={contactName} onChange={setContactName} placeholder={t("create.contactNamePlaceholder")} />
          <Field label={t("create.contactPhone")} value={contactPhone} onChange={setContactPhone} placeholder="+216 …" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <CheckField label={t("create.publishNow")} checked={publishNow} onChange={setPublishNow} />
          <div className="flex items-center gap-2">
            <AdminButton variant="ghost" onClick={() => { reset(); setOpen(false); }}>
              {t("common.cancel")}
            </AdminButton>
            <AdminButton variant="primary" pending={busy} onClick={submit}>
              {publishNow ? t("create.createPublish") : t("create.createDraft")}
            </AdminButton>
          </div>
        </div>
      </div>
    </section>
  );
}
