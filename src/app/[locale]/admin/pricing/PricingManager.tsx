"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { formatTND } from "@/lib/utils";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_HINT,
  PRODUCT_KIND_LABEL,
  pricePerListing,
  type Product,
  type ProductKind,
} from "@/lib/products";
import { Plus, Power, PowerOff, Save, X, Package, Tag, BadgeCheck, Megaphone, RefreshCw, CalendarClock } from "lucide-react";

/**
 * The price list, edited in place.
 *
 * Grouped by kind rather than shown as one flat table: an admin comes here to
 * answer one question at a time ("what does a car cost to post?", "what do we
 * charge for the badge?"), and a 20-row grid of mixed products answers none of
 * them quickly.
 */

const KIND_ICON: Record<ProductKind, typeof Tag> = {
  listing_single: Tag,
  listing_pack: Package,
  subscription: CalendarClock,
  promo: Megaphone,
  badge_verified: BadgeCheck,
  renewal: RefreshCw,
};

type Draft = {
  name_fr: string;
  price: string;
  category_id: string;
  listing_quota: string;
  duration_days: string;
  description: string;
};

const toDraft = (p: Product): Draft => ({
  name_fr: p.nameFr,
  price: String(p.price),
  category_id: p.categoryId ?? "",
  listing_quota: p.listingQuota != null ? String(p.listingQuota) : "",
  duration_days: p.durationDays != null ? String(p.durationDays) : "",
  description: p.description ?? "",
});

export function PricingManager({
  initial,
  categories,
}: {
  initial: Product[];
  categories: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creatingKind, setCreatingKind] = useState<ProductKind | null>(null);

  const byKind = useMemo(() => {
    const m = new Map<ProductKind, Product[]>();
    for (const k of PRODUCT_KINDS) m.set(k, []);
    for (const p of initial) m.get(p.kind)?.push(p);
    return m;
  }, [initial]);

  const catLabel = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.label ?? "catégorie inconnue" : "toutes catégories";

  function save(id: string, patch: Record<string, unknown>, done?: () => void) {
    start(async () => {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.detail ?? j.error ?? "Échec de l'enregistrement.", "error");
        return;
      }
      toast("Tarif enregistré.", "success");
      done?.();
      router.refresh();
    });
  }

  function create(kind: ProductKind, d: Draft) {
    start(async () => {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name_fr: d.name_fr,
          description: d.description || null,
          price: Number(d.price) || 0,
          category_id: d.category_id || null,
          listing_quota: d.listing_quota ? Number(d.listing_quota) : null,
          duration_days: d.duration_days ? Number(d.duration_days) : null,
          is_active: false, // a new price goes live when the admin says so
          sort_order: 100,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.detail ?? j.error ?? "Échec de la création.", "error");
        return;
      }
      toast("Produit créé — inactif, à vous de l'activer.", "success");
      setCreatingKind(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {PRODUCT_KINDS.map((kind) => {
        const items = byKind.get(kind) ?? [];
        const Icon = KIND_ICON[kind];
        return (
          <section key={kind}>
            <div className="flex items-start justify-between gap-4 border-b border-border pb-2">
              <div className="min-w-0">
                <h2 className="inline-flex items-center gap-2 text-[15px] font-extrabold text-foreground">
                  <Icon className="size-4 text-gold" strokeWidth={2.2} />
                  {PRODUCT_KIND_LABEL[kind]}
                </h2>
                <p className="mt-0.5 text-[12px] text-muted">{PRODUCT_KIND_HINT[kind]}</p>
              </div>
              <AdminButton
                variant="ghost"
                onClick={() =>
                  setCreatingKind(creatingKind === kind ? null : kind)
                }
              >
                <Plus className="size-3.5" /> Ajouter
              </AdminButton>
            </div>

            {creatingKind === kind && (
              <NewProductForm
                kind={kind}
                categories={categories}
                pending={pending}
                onCancel={() => setCreatingKind(null)}
                onCreate={(d) => create(kind, d)}
              />
            )}

            {items.length === 0 && creatingKind !== kind ? (
              <p className="mt-3 text-[12.5px] text-muted">Aucun produit de ce type.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {items.map((p) => {
                  const isEditing = editing === p.id;
                  const per = p.kind === "listing_pack" ? pricePerListing(p) : null;
                  return (
                    <div
                      key={p.id}
                      className={
                        "rounded-xl border p-3.5 transition " +
                        (p.isActive
                          ? "border-border bg-surface"
                          : "border-dashed border-border bg-surface-2/50")
                      }
                    >
                      {isEditing && draft ? (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <Field label="Nom" value={draft.name_fr} onChange={(v) => setDraft({ ...draft, name_fr: v })} />
                          <Field label="Prix (TND)" type="number" value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} />
                          {(kind === "listing_pack" || kind === "subscription") && (
                            <Field label="Publications accordées" type="number" value={draft.listing_quota} onChange={(v) => setDraft({ ...draft, listing_quota: v })} />
                          )}
                          <Field label="Durée (jours)" type="number" value={draft.duration_days} onChange={(v) => setDraft({ ...draft, duration_days: v })} />
                          {kind === "listing_single" && (
                            <label className="block sm:col-span-2">
                              <Label>Catégorie</Label>
                              <select
                                value={draft.category_id}
                                onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
                                className={INPUT}
                              >
                                <option value="">Toutes les catégories</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="block sm:col-span-2">
                            <Label>Description (vue par le vendeur)</Label>
                            <textarea
                              rows={2}
                              value={draft.description}
                              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                              className={INPUT}
                            />
                          </label>
                          <div className="flex gap-2 sm:col-span-2">
                            <AdminButton
                              variant="primary"
                              pending={pending}
                              onClick={() =>
                                save(
                                  p.id,
                                  {
                                    name_fr: draft.name_fr,
                                    price: Number(draft.price) || 0,
                                    description: draft.description || null,
                                    category_id: draft.category_id || null,
                                    listing_quota: draft.listing_quota ? Number(draft.listing_quota) : null,
                                    duration_days: draft.duration_days ? Number(draft.duration_days) : null,
                                  },
                                  () => { setEditing(null); setDraft(null); },
                                )
                              }
                            >
                              <Save className="size-3.5" /> Enregistrer
                            </AdminButton>
                            <AdminButton variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>
                              <X className="size-3.5" /> Annuler
                            </AdminButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="text-[14px] font-bold text-foreground">{p.nameFr}</span>
                              {!p.isActive && (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-muted ring-1 ring-border">
                                  inactif
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-muted">
                              {kind === "listing_single" && <span>{catLabel(p.categoryId)}</span>}
                              {p.listingQuota != null && <span>{p.listingQuota} publications</span>}
                              {p.durationDays != null && <span>{p.durationDays} j</span>}
                              {per != null && p.price > 0 && (
                                <span className="font-semibold text-gold">
                                  {formatTND(per, "fr")} / annonce
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="batta-tabular text-[16px] font-extrabold text-foreground">
                            {p.price > 0 ? `${formatTND(p.price, "fr")} TND` : "—"}
                          </div>

                          <div className="flex gap-1.5">
                            <AdminButton
                              variant="ghost"
                              onClick={() => { setEditing(p.id); setDraft(toDraft(p)); }}
                            >
                              Modifier
                            </AdminButton>
                            <AdminButton
                              variant={p.isActive ? "warnSoft" : "success"}
                              pending={pending}
                              onClick={() => save(p.id, { is_active: !p.isActive })}
                              disabledReason={
                                !p.isActive && p.price <= 0
                                  ? "Fixez un prix avant d'activer"
                                  : undefined
                              }
                              disabled={!p.isActive && p.price <= 0}
                            >
                              {p.isActive ? <><PowerOff className="size-3.5" /> Désactiver</> : <><Power className="size-3.5" /> Activer</>}
                            </AdminButton>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function NewProductForm({
  kind, categories, pending, onCancel, onCreate,
}: {
  kind: ProductKind;
  categories: { id: string; label: string }[];
  pending: boolean;
  onCancel: () => void;
  onCreate: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>({
    name_fr: "",
    price: "",
    category_id: "",
    listing_quota: kind === "listing_pack" ? "5" : "",
    duration_days: kind === "badge_verified" ? "365" : "30",
    description: "",
  });

  return (
    <div className="mt-3 rounded-xl border border-gold-soft bg-gold-faint/40 p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Nom" value={d.name_fr} onChange={(v) => setD({ ...d, name_fr: v })} />
        <Field label="Prix (TND)" type="number" value={d.price} onChange={(v) => setD({ ...d, price: v })} />
        {(kind === "listing_pack" || kind === "subscription") && (
          <Field label="Publications accordées" type="number" value={d.listing_quota} onChange={(v) => setD({ ...d, listing_quota: v })} />
        )}
        <Field label="Durée (jours)" type="number" value={d.duration_days} onChange={(v) => setD({ ...d, duration_days: v })} />
        {kind === "listing_single" && (
          <label className="block sm:col-span-2">
            <Label>Catégorie</Label>
            <select value={d.category_id} onChange={(e) => setD({ ...d, category_id: e.target.value })} className={INPUT}>
              <option value="">Toutes les catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        <label className="block sm:col-span-2">
          <Label>Description</Label>
          <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={INPUT} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <AdminButton
          variant="primary"
          pending={pending}
          disabled={!d.name_fr.trim()}
          disabledReason={!d.name_fr.trim() ? "Donnez-lui un nom" : undefined}
          onClick={() => onCreate(d)}
        >
          <Plus className="size-3.5" /> Créer
        </AdminButton>
        <AdminButton variant="ghost" onClick={onCancel}>Annuler</AdminButton>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Le produit est créé <strong>inactif</strong> : rien n&apos;est mis en vente tant que vous
        ne l&apos;activez pas.
      </p>
    </div>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold-soft";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

function Field({
  label, value, onChange, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        min={type === "number" ? 0 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}
