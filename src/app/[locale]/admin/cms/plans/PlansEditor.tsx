"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  upsertSubscriptionPlan,
  deleteSubscriptionPlan,
  type PlanInput,
} from "../actions";

interface Plan {
  slug: string;
  name_ar: string | null;
  name_fr: string;
  tagline_ar: string | null;
  tagline_fr: string | null;
  monthly_price: number;
  listings_per_month: number;
  search_priority_pct: number;
  featured_listing_discount_pct: number;
  has_trusted_seller_badge: boolean;
  has_homepage_placement: boolean;
  has_custom_reports: boolean;
  max_listing_duration_days: number;
  max_photos: number;
  max_video_seconds: number;
  max_concurrent_active_listings: number;
  auto_renew_listings: boolean;
  direct_phone_visible: boolean;
  bulk_import_enabled: boolean;
  analytics_level: "basic" | "advanced" | "advanced_export";
  showroom_level: "none" | "standard" | "custom" | "branded";
  support_level: "email" | "chat" | "dedicated";
  features: string[];
  badge_tone: "silver" | "gold" | "diamond" | "custom";
  is_visible: boolean;
  position: number;
}

const EMPTY: Plan = {
  slug: "",
  name_ar: null,
  name_fr: "",
  tagline_ar: null,
  tagline_fr: null,
  monthly_price: 0,
  listings_per_month: 5,
  search_priority_pct: 0,
  featured_listing_discount_pct: 0,
  has_trusted_seller_badge: false,
  has_homepage_placement: false,
  has_custom_reports: false,
  max_listing_duration_days: 14,
  max_photos: 12,
  max_video_seconds: 120,
  max_concurrent_active_listings: -1,
  auto_renew_listings: false,
  direct_phone_visible: false,
  bulk_import_enabled: false,
  analytics_level: "basic",
  showroom_level: "standard",
  support_level: "email",
  features: [],
  badge_tone: "silver",
  is_visible: true,
  position: 1000,
};

export function PlansEditor({ initial }: { initial: Plan[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Plan[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Plan>(EMPTY);
  const [pending, start] = useTransition();
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  function toPayload(p: Plan, isNew: boolean): PlanInput {
    return {
      slug: p.slug.trim(),
      nameAr: p.name_ar?.trim() || null,
      nameFr: p.name_fr.trim(),
      taglineAr: p.tagline_ar?.trim() || null,
      taglineFr: p.tagline_fr?.trim() || null,
      monthlyPrice: Number(p.monthly_price),
      listingsPerMonth: Number(p.listings_per_month),
      searchPriorityPct: Number(p.search_priority_pct),
      featuredListingDiscountPct: Number(p.featured_listing_discount_pct),
      hasTrustedSellerBadge: p.has_trusted_seller_badge,
      hasHomepagePlacement: p.has_homepage_placement,
      hasCustomReports: p.has_custom_reports,
      maxListingDurationDays: Number(p.max_listing_duration_days),
      maxPhotos: Number(p.max_photos),
      maxVideoSeconds: Number(p.max_video_seconds),
      maxConcurrentActiveListings: Number(p.max_concurrent_active_listings),
      autoRenewListings: p.auto_renew_listings,
      directPhoneVisible: p.direct_phone_visible,
      bulkImportEnabled: p.bulk_import_enabled,
      analyticsLevel: p.analytics_level,
      showroomLevel: p.showroom_level,
      supportLevel: p.support_level,
      features: p.features.filter((f) => f.trim().length > 0),
      badgeTone: p.badge_tone,
      isVisible: p.is_visible,
      position: Number(p.position),
      isNew,
    };
  }

  function save(p: Plan, isNew: boolean) {
    if (!p.slug.trim() || !p.name_fr.trim()) {
      toast("Slug + nom FR requis", "warning");
      return;
    }
    start(async () => {
      const r = await upsertSubscriptionPlan(toPayload(p, isNew));
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("✓ Enregistrée", "success");
      if (isNew) {
        setAdding(false);
        setDraft(EMPTY);
      }
      router.refresh();
    });
  }

  async function remove(slug: string) {
    if (
      !window.confirm(
        "Supprimer ce plan ? Les abonnés actuels ne seront pas affectés.",
      )
    )
      return;
    const r = await deleteSubscriptionPlan(slug);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.slug !== slug));
    toast("Supprimée", "warning");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--foreground-muted)]">
        Plans d&apos;abonnement professionnels. Chaque champ ci-dessous pilote
        une limite ou un avantage réel — visible sur{" "}
        <code className="bg-[var(--surface-2)] px-1 rounded">/pricing</code>{" "}
        et appliqué côté serveur. <code>-1</code> = illimité.
      </p>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Nouveau plan
        </Button>
      </div>

      {adding && (
        <PlanCard
          item={draft}
          onChange={setDraft}
          onSave={() => save(draft, true)}
          onCancel={() => {
            setAdding(false);
            setDraft(EMPTY);
          }}
          pending={pending}
          expanded
          isNew
        />
      )}

      <div className="space-y-2">
        {items.map((p, idx) => (
          <PlanCard
            key={p.slug}
            item={p}
            onChange={(x) =>
              setItems((prev) => prev.map((q, i) => (i === idx ? x : q)))
            }
            onSave={() => save(items[idx], false)}
            onDelete={() => remove(p.slug)}
            pending={pending}
            expanded={openSlug === p.slug}
            onToggle={() =>
              setOpenSlug(openSlug === p.slug ? null : p.slug)
            }
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  item,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onToggle,
  pending,
  expanded,
  isNew,
}: {
  item: Plan;
  onChange: (p: Plan) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onToggle?: () => void;
  pending: boolean;
  expanded?: boolean;
  isNew?: boolean;
}) {
  const toneClass =
    item.badge_tone === "diamond"
      ? "text-cyan-300"
      : item.badge_tone === "gold"
        ? "text-[var(--gold)]"
        : item.badge_tone === "silver"
          ? "text-slate-300"
          : "text-foreground";

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-[var(--surface-2)] transition-colors text-start"
      >
        <div className={`text-base font-extrabold ${toneClass}`}>
          {item.name_fr || (isNew ? "Nouveau plan" : "—")}
        </div>
        <div className="text-xs text-[var(--foreground-muted)] flex-1 min-w-0">
          <span className="font-mono">{item.slug || "—"}</span>
          {!isNew && (
            <>
              {" · "}
              {item.monthly_price} DT/mo
              {" · "}
              {item.listings_per_month === -1
                ? "illimité"
                : `${item.listings_per_month} mises en ligne`}
              {item.is_visible ? "" : " · masqué"}
            </>
          )}
        </div>
        {!isNew && (
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-5">
          {/* IDENTITY */}
          <Section title="Identité">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Slug (immuable une fois créé)">
                <Input
                  value={item.slug}
                  disabled={!isNew}
                  onChange={(e) =>
                    onChange({ ...item, slug: e.target.value })
                  }
                  placeholder="silver"
                />
              </Field>
              <Field label="Badge">
                <select
                  value={item.badge_tone}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      badge_tone: e.target.value as Plan["badge_tone"],
                    })
                  }
                  className="w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                >
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="diamond">Diamond</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Nom (FR)">
                <Input
                  value={item.name_fr}
                  onChange={(e) =>
                    onChange({ ...item, name_fr: e.target.value })
                  }
                />
              </Field>
              <Field label="الاسم (AR)">
                <Input
                  value={item.name_ar ?? ""}
                  onChange={(e) =>
                    onChange({ ...item, name_ar: e.target.value || null })
                  }
                />
              </Field>
              <Field label="Accroche (FR)">
                <Input
                  value={item.tagline_fr ?? ""}
                  onChange={(e) =>
                    onChange({ ...item, tagline_fr: e.target.value || null })
                  }
                />
              </Field>
              <Field label="الشعار (AR)">
                <Input
                  value={item.tagline_ar ?? ""}
                  onChange={(e) =>
                    onChange({ ...item, tagline_ar: e.target.value || null })
                  }
                />
              </Field>
            </div>
          </Section>

          {/* PRICING + QUOTAS */}
          <Section title="Tarif & quotas">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Prix / mois (DT)">
                <Input
                  type="number"
                  value={item.monthly_price}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      monthly_price: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Mises en ligne / mois (-1 = illimité)">
                <Input
                  type="number"
                  value={item.listings_per_month}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      listings_per_month: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Annonces actives simultanées (-1 = illimité)">
                <Input
                  type="number"
                  value={item.max_concurrent_active_listings}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      max_concurrent_active_listings: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Durée max d'une enchère (jours)">
                <Input
                  type="number"
                  value={item.max_listing_duration_days}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      max_listing_duration_days: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Photos max par annonce">
                <Input
                  type="number"
                  value={item.max_photos}
                  onChange={(e) =>
                    onChange({ ...item, max_photos: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Durée max vidéo (s)">
                <Input
                  type="number"
                  value={item.max_video_seconds}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      max_video_seconds: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Priorité de recherche (%)">
                <Input
                  type="number"
                  value={item.search_priority_pct}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      search_priority_pct: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Remise sur frais Featured / VIP (%)">
                <Input
                  type="number"
                  value={item.featured_listing_discount_pct}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      featured_listing_discount_pct: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          {/* PERKS / LEVELS */}
          <Section title="Avantages & niveaux">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Niveau de boutique">
                <select
                  value={item.showroom_level}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      showroom_level: e.target.value as Plan["showroom_level"],
                    })
                  }
                  className="w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                >
                  <option value="none">Aucune</option>
                  <option value="standard">Standard</option>
                  <option value="custom">Personnalisée</option>
                  <option value="branded">Brandée</option>
                </select>
              </Field>
              <Field label="Niveau d'analytique">
                <select
                  value={item.analytics_level}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      analytics_level: e.target.value as Plan["analytics_level"],
                    })
                  }
                  className="w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                >
                  <option value="basic">Basique</option>
                  <option value="advanced">Avancée</option>
                  <option value="advanced_export">Avancée + export</option>
                </select>
              </Field>
              <Field label="Support">
                <select
                  value={item.support_level}
                  onChange={(e) =>
                    onChange({
                      ...item,
                      support_level: e.target.value as Plan["support_level"],
                    })
                  }
                  className="w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                >
                  <option value="email">Email</option>
                  <option value="chat">Email + chat</option>
                  <option value="dedicated">Chargé de compte dédié</option>
                </select>
              </Field>
            </div>
            <div className="grid md:grid-cols-3 gap-2 text-sm pt-1">
              <CheckLabel
                checked={item.has_trusted_seller_badge}
                onChange={(v) =>
                  onChange({ ...item, has_trusted_seller_badge: v })
                }
                label="Badge « vendeur de confiance »"
              />
              <CheckLabel
                checked={item.has_homepage_placement}
                onChange={(v) =>
                  onChange({ ...item, has_homepage_placement: v })
                }
                label="Apparition permanente en page d'accueil"
              />
              <CheckLabel
                checked={item.has_custom_reports}
                onChange={(v) =>
                  onChange({ ...item, has_custom_reports: v })
                }
                label="Rapports mensuels personnalisés"
              />
              <CheckLabel
                checked={item.auto_renew_listings}
                onChange={(v) =>
                  onChange({ ...item, auto_renew_listings: v })
                }
                label="Renouvellement automatique des annonces"
              />
              <CheckLabel
                checked={item.direct_phone_visible}
                onChange={(v) =>
                  onChange({ ...item, direct_phone_visible: v })
                }
                label="Numéro de téléphone visible publiquement"
              />
              <CheckLabel
                checked={item.bulk_import_enabled}
                onChange={(v) =>
                  onChange({ ...item, bulk_import_enabled: v })
                }
                label="Import en masse (CSV / Excel)"
              />
            </div>
          </Section>

          {/* DISPLAY */}
          <Section title="Affichage public">
            <Field label="Bullets affichés sur /pricing (un par ligne)">
              <textarea
                value={item.features.join("\n")}
                onChange={(e) =>
                  onChange({
                    ...item,
                    features: e.target.value.split("\n"),
                  })
                }
                rows={4}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
              />
            </Field>
            <div className="grid md:grid-cols-2 gap-3 pt-2">
              <Field label="Position (tri)">
                <Input
                  type="number"
                  value={item.position}
                  onChange={(e) =>
                    onChange({ ...item, position: Number(e.target.value) })
                  }
                />
              </Field>
              <CheckLabel
                checked={item.is_visible}
                onChange={(v) => onChange({ ...item, is_visible: v })}
                label="Visible publiquement sur /pricing"
              />
            </div>
          </Section>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Annuler
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={pending}>
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
            {onDelete && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CheckLabel({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
