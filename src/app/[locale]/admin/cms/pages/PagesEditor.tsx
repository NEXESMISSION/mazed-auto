"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertCmsPage } from "../actions";

interface Row {
  slug: string;
  label: string;
  titleAr: string;
  titleFr: string;
  bodyAr: string;
  bodyFr: string;
  updatedAt: string | null;
}

export function PagesEditor({ rows }: { rows: Row[] }) {
  const [openSlug, setOpenSlug] = useState<string | null>(rows[0]?.slug ?? null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <button
            key={r.slug}
            onClick={() => setOpenSlug(r.slug)}
            className={`px-3 h-9 rounded-full text-sm border ${
              openSlug === r.slug
                ? "bg-[var(--gold)] border-[var(--gold)] text-black font-bold"
                : "bg-[var(--surface-2)] border-[var(--border)]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {rows
        .filter((r) => r.slug === openSlug)
        .map((r) => (
          <PageForm key={r.slug} initial={r} />
        ))}
    </div>
  );
}

function PageForm({ initial }: { initial: Row }) {
  const { toast } = useToast();
  const [titleAr, setTitleAr] = useState(initial.titleAr);
  const [titleFr, setTitleFr] = useState(initial.titleFr);
  const [bodyAr, setBodyAr] = useState(initial.bodyAr);
  const [bodyFr, setBodyFr] = useState(initial.bodyFr);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await upsertCmsPage({
        slug: initial.slug,
        titleAr,
        titleFr,
        bodyAr,
        bodyFr,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast(`✓ Page "${initial.label}" enregistrée`, "success");
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Titre (FR)
          </label>
          <Input
            value={titleFr}
            onChange={(e) => setTitleFr(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Titre (AR)
          </label>
          <Input
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            className="mt-1"
            dir="rtl"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Contenu (FR — markdown)
          </label>
          <textarea
            value={bodyFr}
            onChange={(e) => setBodyFr(e.target.value)}
            rows={14}
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)] font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Contenu (AR — markdown)
          </label>
          <textarea
            value={bodyAr}
            onChange={(e) => setBodyAr(e.target.value)}
            rows={14}
            dir="rtl"
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)] font-mono"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Enregistrement..." : "Enregistrer"}
        </Button>
        {initial.updatedAt && (
          <span className="text-[11px] text-[var(--foreground-subtle)]">
            mis à jour {new Date(initial.updatedAt).toLocaleString("fr-FR")}
          </span>
        )}
      </div>
    </div>
  );
}
