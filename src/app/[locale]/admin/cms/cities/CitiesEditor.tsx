"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertCity, deleteCity } from "../actions";

interface City {
  slug: string;
  name_ar: string | null;
  name_fr: string;
  region: string | null;
  is_active: boolean;
  position: number;
}

export function CitiesEditor({ initial }: { initial: City[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<City[]>(initial);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<City>({
    slug: "",
    name_ar: null,
    name_fr: "",
    region: null,
    is_active: true,
    position: 1000,
  });

  function save(c: City, isNew: boolean) {
    if (!c.slug.trim() || !c.name_fr.trim()) {
      toast("Slug + nom FR requis", "warning");
      return;
    }
    start(async () => {
      const r = await upsertCity({
        slug: c.slug.trim(),
        nameAr: c.name_ar,
        nameFr: c.name_fr.trim(),
        region: c.region,
        isActive: c.is_active,
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
          region: null,
          is_active: true,
          position: 1000,
        });
      }
      router.refresh();
    });
  }

  async function remove(slug: string) {
    if (!window.confirm("Supprimer cette ville ?")) return;
    const r = await deleteCity(slug);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.slug !== slug));
    toast("Supprimée", "warning");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle ville
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
  item: City;
  onChange: (c: City) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  pending: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-[120px_1fr_1fr_120px_80px_auto] gap-2 p-3 items-center">
      <Input
        value={item.slug}
        disabled={!isNew}
        onChange={(e) => onChange({ ...item, slug: e.target.value })}
        placeholder="slug"
      />
      <Input
        value={item.name_fr}
        onChange={(e) => onChange({ ...item, name_fr: e.target.value })}
        placeholder="Nom FR"
      />
      <Input
        dir="rtl"
        value={item.name_ar ?? ""}
        onChange={(e) =>
          onChange({ ...item, name_ar: e.target.value || null })
        }
        placeholder="الاسم بالعربية"
      />
      <Input
        value={item.region ?? ""}
        onChange={(e) =>
          onChange({ ...item, region: e.target.value || null })
        }
        placeholder="Région"
      />
      <Input
        type="number"
        value={item.position}
        onChange={(e) =>
          onChange({ ...item, position: Number(e.target.value) })
        }
      />
      <div className="flex gap-2 items-center">
        <label className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={item.is_active}
            onChange={(e) =>
              onChange({ ...item, is_active: e.target.checked })
            }
          />
          actif
        </label>
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
