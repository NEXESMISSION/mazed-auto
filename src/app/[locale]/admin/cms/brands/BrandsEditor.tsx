"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Check,
  ImageIcon,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { compressImage } from "@/lib/imageCompress";
import { upsertBrand, deleteBrand, uploadBrandLogo } from "../actions";

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
      {/* Toolbar — sticky on mobile so the "Nouvelle marque" CTA never
          scrolls out of reach in a long list. */}
      <div className="sticky top-14 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 md:py-0 bg-background/95 backdrop-blur md:bg-transparent md:backdrop-blur-none flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] md:hidden">
          {items.length} marque{items.length === 1 ? "" : "s"}
        </div>
        <Button size="sm" onClick={() => setAdding(true)} className="ms-auto">
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

      {/* Mobile: cards stack with their own border, no shared container.
          Desktop: rows in one bordered card divided by hairlines. */}
      <div className="space-y-3 md:space-y-0 md:rounded-[var(--radius-md)] md:bg-[var(--surface)] md:border md:border-[var(--border)] md:divide-y md:divide-[var(--border)]">
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
    <>
      <MobileRow
        item={item}
        onChange={onChange}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
        pending={pending}
        isNew={isNew}
      />
      <DesktopRow
        item={item}
        onChange={onChange}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
        pending={pending}
        isNew={isNew}
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────
   MOBILE — card layout. One brand per card so each row feels like a
   self-contained edit surface. Visual order:
     1. Hero strip: big image preview + name input + slug (muted)
     2. Full-width "Téléverser" button (or URL paste)
     3. Compact meta row: position + active toggle
     4. Sticky-feel action bar at the bottom
   ────────────────────────────────────────────────────────────────── */
function MobileRow({
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
    <div
      className={`md:hidden rounded-[var(--radius-md)] border ${
        isNew
          ? "border-[var(--gold)]/40 bg-[var(--gold-faint)]/30"
          : "border-[var(--border)] bg-[var(--surface)]"
      } p-4 space-y-4`}
    >
      {isNew && (
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          Nouvelle marque
        </div>
      )}

      {/* Hero — image + name */}
      <div className="flex items-start gap-3">
        <ImagePreview
          url={item.logo_url}
          onClear={() => onChange({ ...item, logo_url: null })}
          size="lg"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Input
            value={item.display_name}
            onChange={(e) =>
              onChange({ ...item, display_name: e.target.value })
            }
            placeholder="Nom (ex. Renault)"
            className="font-bold text-base"
          />
          <Input
            value={item.slug}
            disabled={!isNew}
            onChange={(e) => onChange({ ...item, slug: e.target.value })}
            placeholder="slug"
            className="text-xs text-[var(--foreground-muted)]"
          />
        </div>
      </div>

      {/* Image actions — full-width upload, URL fallback collapsed below */}
      <UploadField
        slug={item.slug || "brand"}
        value={item.logo_url}
        onChange={(url) => onChange({ ...item, logo_url: url })}
        layout="mobile"
      />

      {/* Meta — position + active. Position is small (3 digits max);
          active is a clear toggle pill instead of a tiny checkbox. */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] mb-1">
            Position
          </div>
          <Input
            type="number"
            value={item.position}
            onChange={(e) =>
              onChange({ ...item, position: Number(e.target.value) })
            }
            className="text-base tabular-nums"
          />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] mb-1">
            Statut
          </div>
          <button
            type="button"
            onClick={() =>
              onChange({ ...item, is_active: !item.is_active })
            }
            className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] text-sm font-bold ring-1 transition-colors ${
              item.is_active
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                : "bg-[var(--surface-2)] text-[var(--foreground-muted)] ring-[var(--border)]"
            }`}
          >
            {item.is_active ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Active
              </>
            ) : (
              "Inactive"
            )}
          </button>
        </div>
      </div>

      {/* Action bar — full-width buttons, side-by-side */}
      <div className="flex items-center gap-2 pt-1">
        {onCancel && (
          <Button
            type="button"
            size="md"
            variant="ghost"
            fullWidth
            onClick={onCancel}
          >
            Annuler
          </Button>
        )}
        <Button
          type="button"
          size="md"
          fullWidth
          onClick={onSave}
          disabled={pending}
        >
          <Save className="h-4 w-4" />
          Enregistrer
        </Button>
        {onDelete && (
          <Button
            type="button"
            size="md"
            variant="danger"
            onClick={onDelete}
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   DESKTOP — table-like grid. Many rows on screen at once, dense.
   Identical to the previous layout so power users keep their muscle
   memory; only the mobile path changed.
   ────────────────────────────────────────────────────────────────── */
function DesktopRow({
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
    <div className="hidden md:grid md:grid-cols-[120px_1fr_260px_80px_auto] gap-2 p-3 md:items-start">
      <Input
        value={item.slug}
        disabled={!isNew}
        onChange={(e) => onChange({ ...item, slug: e.target.value })}
        placeholder="slug"
      />
      <Input
        value={item.display_name}
        onChange={(e) => onChange({ ...item, display_name: e.target.value })}
        placeholder="Nom affiché"
      />
      <UploadField
        slug={item.slug || "brand"}
        value={item.logo_url}
        onChange={(url) => onChange({ ...item, logo_url: url })}
        layout="desktop"
      />
      <Input
        type="number"
        value={item.position}
        onChange={(e) =>
          onChange({ ...item, position: Number(e.target.value) })
        }
      />
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
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            ✕
          </Button>
        )}
        <Button type="button" size="sm" onClick={onSave} disabled={pending}>
          <Save className="h-3.5 w-3.5" />
        </Button>
        {onDelete && (
          <Button type="button" size="sm" variant="danger" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   ImagePreview — square thumbnail with a clear button. Two sizes:
     "lg" used on mobile (visible from across the room),
     "sm" used inside the desktop UploadField.
   ────────────────────────────────────────────────────────────────── */
function ImagePreview({
  url,
  onClear,
  size,
}: {
  url: string | null;
  onClear: () => void;
  size: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  return (
    <div
      className={`relative ${dim} shrink-0 overflow-hidden rounded-[var(--radius)] ring-1 ring-[var(--border)] bg-[var(--surface-2)]`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {/* invalid URL — leave placeholder */}}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--foreground-muted)]">
          <ImageIcon className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
        </div>
      )}
      {url && (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          aria-label="Supprimer l'image"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   UploadField — wraps the file picker + URL fallback. Mobile shows a
   big primary "Téléverser" button + collapsible URL paste; desktop
   shows the previous compact horizontal layout.
   ────────────────────────────────────────────────────────────────── */
function UploadField({
  slug,
  value,
  onChange,
  layout,
}: {
  slug: string;
  value: string | null;
  onChange: (url: string | null) => void;
  layout: "mobile" | "desktop";
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      // Compress before upload — admins may drag a 3 MB hero photo for
      // a brand tile that ends up rendered at ~480 px. The server-side
      // bucket policy already caps at 2 MB; compressing client-side
      // means a typical upload is 50-150 KB and never hits the cap.
      // SVGs pass through unchanged (not a raster format).
      const payload =
        file.type === "image/svg+xml"
          ? file
          : await compressImage(file, { maxEdge: 800, quality: 0.85 });
      const fd = new FormData();
      fd.append("file", payload);
      fd.append("slug", slug);
      const r = await uploadBrandLogo(fd);
      if (!r.ok) {
        toast("Téléversement échoué : " + r.error, "error");
        return;
      }
      onChange(r.url);
      toast("✓ Image téléversée", "success");
    } finally {
      setUploading(false);
    }
  }

  const hiddenFileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/svg+xml"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = "";
      }}
    />
  );

  if (layout === "mobile") {
    return (
      <div className="space-y-2">
        {hiddenFileInput}
        <Button
          type="button"
          size="md"
          variant="ghost"
          fullWidth
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? "Téléversement…"
            : value
              ? "Remplacer l'image"
              : "Téléverser une image"}
        </Button>
        {showUrl ? (
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="URL de l'image"
            className="text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowUrl(true)}
            className="block w-full text-center text-[11px] text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors py-1"
          >
            ou coller une URL
          </button>
        )}
      </div>
    );
  }

  // Desktop — keep the previous compact layout (thumbnail + button + URL).
  return (
    <div className="space-y-2">
      {hiddenFileInput}
      <div className="flex items-center gap-2">
        <ImagePreview
          url={value}
          onClear={() => onChange(null)}
          size="sm"
        />
        <div className="flex-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Téléversement…" : "Téléverser"}
          </Button>
        </div>
      </div>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="ou coller une URL"
        className="text-xs"
      />
    </div>
  );
}
