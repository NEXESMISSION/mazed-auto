"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertCategory, deleteCategory } from "../actions";

interface Category {
  slug: string;
  name_ar: string | null;
  name_fr: string;
  image_url: string | null;
  is_visible: boolean;
  position: number;
}

export function CategoriesEditor({ initial }: { initial: Category[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Category[]>(initial);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Category>({
    slug: "",
    name_ar: null,
    name_fr: "",
    image_url: null,
    is_visible: true,
    position: 1000,
  });

  function save(c: Category, isNew: boolean) {
    if (!c.slug.trim() || !c.name_fr.trim()) {
      toast("Slug + nom FR requis", "warning");
      return;
    }
    start(async () => {
      const r = await upsertCategory({
        slug: c.slug.trim(),
        nameAr: c.name_ar?.trim() || null,
        nameFr: c.name_fr.trim(),
        imageUrl: c.image_url?.trim() || null,
        isVisible: c.is_visible,
        position: c.position,
        isNew,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("✓ Enregistrée", "success");
      if (isNew) {
        setAdding(false);
        setDraft({
          slug: "",
          name_ar: null,
          name_fr: "",
          image_url: null,
          is_visible: true,
          position: 1000,
        });
      }
      router.refresh();
    });
  }

  async function remove(slug: string) {
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    const r = await deleteCategory(slug);
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
        Les catégories pilotent la bande “Parcourir par carrosserie” sur la
        page d’accueil et le filtre <code>?body=</code> sur /auctions. Le slug
        doit correspondre à un type de carrosserie déclaré côté code (sedan,
        suv, hatchback, pickup, coupe, convertible, wagon, van).
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle catégorie
        </Button>
      </div>
      {adding && (
        <Row
          item={draft}
          onChange={(x) => setDraft(x)}
          onSave={() => save(draft, true)}
          onCancel={() => setAdding(false)}
          pending={pending}
          isNew
        />
      )}
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {items.map((c, idx) => (
          <Row
            key={c.slug}
            item={c}
            onChange={(x) =>
              setItems((prev) => prev.map((p, i) => (i === idx ? x : p)))
            }
            onSave={() => save(items[idx], false)}
            onDelete={() => remove(c.slug)}
            pending={pending}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  onChange,
  onSave,
  onDelete,
  onCancel,
  pending,
  isNew,
}: {
  item: Category;
  onChange: (c: Category) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  pending: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-[120px_140px_140px_1fr_80px_80px_auto] gap-2 p-3 md:items-center">
      <MobileLabel label="Slug">
        <Input
          value={item.slug}
          disabled={!isNew}
          onChange={(e) => onChange({ ...item, slug: e.target.value })}
          placeholder="slug"
        />
      </MobileLabel>
      <MobileLabel label="Nom (FR)">
        <Input
          value={item.name_fr}
          onChange={(e) => onChange({ ...item, name_fr: e.target.value })}
          placeholder="Nom (FR)"
        />
      </MobileLabel>
      <MobileLabel label="الاسم (AR)">
        <Input
          value={item.name_ar ?? ""}
          onChange={(e) =>
            onChange({ ...item, name_ar: e.target.value || null })
          }
          placeholder="الاسم (AR)"
        />
      </MobileLabel>
      <MobileLabel label="Image URL">
        <div className="flex items-center gap-2 min-w-0">
          {item.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              className="h-9 w-9 rounded object-cover ring-1 ring-[var(--border)] shrink-0"
            />
          )}
          <Input
            value={item.image_url ?? ""}
            onChange={(e) =>
              onChange({ ...item, image_url: e.target.value || null })
            }
            placeholder="URL image"
          />
        </div>
      </MobileLabel>
      <MobileLabel label="Position">
        <Input
          type="number"
          value={item.position}
          onChange={(e) =>
            onChange({ ...item, position: Number(e.target.value) })
          }
        />
      </MobileLabel>
      <label className="inline-flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={item.is_visible}
          onChange={(e) =>
            onChange({ ...item, is_visible: e.target.checked })
          }
        />
        visible
      </label>
      <div className="flex gap-2 items-center flex-wrap justify-end md:flex-nowrap">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            ✕
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={pending}>
          <Save className="h-3.5 w-3.5" />
        </Button>
        {onDelete && (
          <Button size="sm" variant="danger" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Mobile-only label above the field; hidden on md+ where the cards
 *  read as a single horizontal row. */
function MobileLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="md:hidden text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
