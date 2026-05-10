"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertBanner, deleteBanner } from "../actions";

interface Banner {
  id: string;
  title_ar: string | null;
  title_fr: string | null;
  subtitle_ar: string | null;
  subtitle_fr: string | null;
  cta_label_ar: string | null;
  cta_label_fr: string | null;
  cta_href: string | null;
  image_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  position: number;
}

export function PromosEditor({ initial }: { initial: Banner[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Banner[]>(initial);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  function blank(): Banner {
    return {
      id: "",
      title_ar: null,
      title_fr: "",
      subtitle_ar: null,
      subtitle_fr: null,
      cta_label_ar: null,
      cta_label_fr: null,
      cta_href: null,
      image_url: null,
      is_active: true,
      starts_at: null,
      ends_at: null,
      position:
        items.length === 0
          ? 10
          : Math.max(...items.map((i) => i.position)) + 10,
    };
  }

  function save(b: Banner, isNew: boolean) {
    start(async () => {
      const r = await upsertBanner({
        id: b.id || undefined,
        titleAr: b.title_ar,
        titleFr: b.title_fr,
        subtitleAr: b.subtitle_ar,
        subtitleFr: b.subtitle_fr,
        ctaLabelAr: b.cta_label_ar,
        ctaLabelFr: b.cta_label_fr,
        ctaHref: b.cta_href,
        imageUrl: b.image_url,
        isActive: b.is_active,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        position: b.position,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("✓ Enregistré", "success");
      router.refresh();
      if (isNew) setOpenId(null);
    });
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer ce promo ?")) return;
    const r = await deleteBanner(id);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast("Supprimé", "warning");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setItems((prev) => [blank(), ...prev]);
            setOpenId("__new__");
          }}
        >
          <Plus className="h-4 w-4" />
          Nouveau promo
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((b, idx) => (
          <Row
            key={b.id || `new-${idx}`}
            item={b}
            isNew={!b.id}
            onChange={(x) =>
              setItems((prev) => prev.map((p, i) => (i === idx ? x : p)))
            }
            onSave={() => save(items[idx], !b.id)}
            onDelete={b.id ? () => remove(b.id) : undefined}
            pending={pending}
            isOpen={openId === (b.id || "__new__")}
            onToggle={() =>
              setOpenId(openId === (b.id || "__new__") ? null : b.id || "__new__")
            }
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  isNew,
  onChange,
  onSave,
  onDelete,
  pending,
  isOpen,
  onToggle,
}: {
  item: Banner;
  isNew: boolean;
  onChange: (b: Banner) => void;
  onSave: () => void;
  onDelete?: () => void;
  pending: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--surface-2)]"
      >
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">
            {item.title_fr || (isNew ? "(nouveau promo)" : "(sans titre)")}
          </div>
          <div className="text-xs text-[var(--foreground-muted)]">
            {item.is_active ? "actif" : "désactivé"} · pos {item.position}
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="p-4 border-t border-[var(--border)] space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Titre (FR)
              </label>
              <Input
                value={item.title_fr ?? ""}
                onChange={(e) =>
                  onChange({ ...item, title_fr: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Titre (AR)
              </label>
              <Input
                dir="rtl"
                value={item.title_ar ?? ""}
                onChange={(e) =>
                  onChange({ ...item, title_ar: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Sous-titre (FR)
              </label>
              <Input
                value={item.subtitle_fr ?? ""}
                onChange={(e) =>
                  onChange({ ...item, subtitle_fr: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Sous-titre (AR)
              </label>
              <Input
                dir="rtl"
                value={item.subtitle_ar ?? ""}
                onChange={(e) =>
                  onChange({ ...item, subtitle_ar: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                CTA libellé (FR)
              </label>
              <Input
                value={item.cta_label_fr ?? ""}
                onChange={(e) =>
                  onChange({ ...item, cta_label_fr: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                CTA URL
              </label>
              <Input
                value={item.cta_href ?? ""}
                onChange={(e) =>
                  onChange({ ...item, cta_href: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Image URL
              </label>
              <Input
                value={item.image_url ?? ""}
                onChange={(e) =>
                  onChange({ ...item, image_url: e.target.value || null })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Position
              </label>
              <Input
                type="number"
                value={item.position}
                onChange={(e) =>
                  onChange({ ...item, position: Number(e.target.value) })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Actif
              </label>
              <div className="mt-3">
                <input
                  type="checkbox"
                  checked={item.is_active}
                  onChange={(e) =>
                    onChange({ ...item, is_active: e.target.checked })
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Début (ISO ou vide)
              </label>
              <Input
                value={item.starts_at ?? ""}
                onChange={(e) =>
                  onChange({ ...item, starts_at: e.target.value || null })
                }
                placeholder="2026-06-01T00:00:00Z"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Fin (ISO ou vide)
              </label>
              <Input
                value={item.ends_at ?? ""}
                onChange={(e) =>
                  onChange({ ...item, ends_at: e.target.value || null })
                }
                placeholder="2026-07-01T00:00:00Z"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {onDelete && (
              <Button variant="danger" size="sm" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={pending}>
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
