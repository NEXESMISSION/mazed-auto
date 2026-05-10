"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertFeature, deleteFeature } from "../actions";

interface Feat {
  slug: string;
  label_ar: string | null;
  label_fr: string;
  category: string | null;
  is_active: boolean;
  position: number;
}

export function FeaturesEditor({ initial }: { initial: Feat[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Feat[]>(initial);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Feat>({
    slug: "",
    label_ar: null,
    label_fr: "",
    category: null,
    is_active: true,
    position: 1000,
  });

  function save(f: Feat, isNew: boolean) {
    if (!f.slug.trim() || !f.label_fr.trim()) {
      toast("Slug + libellé FR requis", "warning");
      return;
    }
    start(async () => {
      const r = await upsertFeature({
        slug: f.slug.trim(),
        labelAr: f.label_ar,
        labelFr: f.label_fr.trim(),
        category: f.category,
        isActive: f.is_active,
        position: f.position,
        isNew,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("✓ Enregistré", "success");
      if (isNew) {
        setAdding(false);
        setDraft({
          slug: "",
          label_ar: null,
          label_fr: "",
          category: null,
          is_active: true,
          position: 1000,
        });
      }
      router.refresh();
    });
  }

  async function remove(slug: string) {
    if (!window.confirm("Supprimer cet équipement ?")) return;
    const r = await deleteFeature(slug);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.slug !== slug));
    toast("Supprimé", "warning");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Nouvel équipement
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
        {items.map((it, idx) => (
          <Row
            key={it.slug}
            item={it}
            onChange={(x) =>
              setItems((prev) => prev.map((p, i) => (i === idx ? x : p)))
            }
            onSave={() => save(items[idx], false)}
            onDelete={() => remove(it.slug)}
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
  item: Feat;
  onChange: (b: Feat) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  pending: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-[140px_1fr_1fr_120px_80px_auto] gap-2 p-3 items-center">
      <Input
        value={item.slug}
        disabled={!isNew}
        onChange={(e) => onChange({ ...item, slug: e.target.value })}
        placeholder="slug"
      />
      <Input
        value={item.label_fr}
        onChange={(e) => onChange({ ...item, label_fr: e.target.value })}
        placeholder="Libellé FR"
      />
      <Input
        dir="rtl"
        value={item.label_ar ?? ""}
        onChange={(e) =>
          onChange({ ...item, label_ar: e.target.value || null })
        }
        placeholder="بالعربية"
      />
      <Input
        value={item.category ?? ""}
        onChange={(e) =>
          onChange({ ...item, category: e.target.value || null })
        }
        placeholder="Catégorie"
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
