"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertBrand, deleteBrand } from "../actions";

interface Brand {
  slug: string;
  display_name: string;
  logo_url: string | null;
  is_active: boolean;
  position: number;
}

export function BrandsEditor({ initial }: { initial: Brand[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Brand[]>(initial);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Brand>({
    slug: "",
    display_name: "",
    logo_url: null,
    is_active: true,
    position: 1000,
  });

  function save(b: Brand, isNew: boolean) {
    if (!b.slug.trim() || !b.display_name.trim()) {
      toast("Slug + nom requis", "warning");
      return;
    }
    start(async () => {
      const r = await upsertBrand({
        slug: b.slug.trim(),
        displayName: b.display_name.trim(),
        logoUrl: b.logo_url,
        isActive: b.is_active,
        position: b.position,
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
          display_name: "",
          logo_url: null,
          is_active: true,
          position: 1000,
        });
      }
      router.refresh();
    });
  }

  async function remove(slug: string) {
    if (!window.confirm("Supprimer cette marque ?")) return;
    const r = await deleteBrand(slug);
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
          Nouvelle marque
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
        {items.map((b, idx) => (
          <Row
            key={b.slug}
            item={b}
            onChange={(x) =>
              setItems((prev) => prev.map((p, i) => (i === idx ? x : p)))
            }
            onSave={() => save(items[idx], false)}
            onDelete={() => remove(b.slug)}
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
  item: Brand;
  onChange: (b: Brand) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  pending: boolean;
  isNew?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-[140px_1fr_120px_80px_auto] gap-2 p-3 md:items-center">
      <MobileLabel label="Slug">
        <Input
          value={item.slug}
          disabled={!isNew}
          onChange={(e) => onChange({ ...item, slug: e.target.value })}
          placeholder="slug"
        />
      </MobileLabel>
      <MobileLabel label="Nom affiché">
        <Input
          value={item.display_name}
          onChange={(e) =>
            onChange({ ...item, display_name: e.target.value })
          }
          placeholder="Nom affiché"
        />
      </MobileLabel>
      <MobileLabel label="Logo URL">
        <Input
          value={item.logo_url ?? ""}
          onChange={(e) =>
            onChange({ ...item, logo_url: e.target.value || null })
          }
          placeholder="logo URL"
        />
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
      <div className="flex gap-2 items-center flex-wrap justify-end md:flex-nowrap">
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

/** Mobile-only label above the field; hides on md+ where the column
 *  header already exists (or the field name is self-evident). */
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
