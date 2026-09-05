"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { withTimeout, isTimeout } from "@/lib/withTimeout";
import {
  DIAGNOSTIC_VERDICTS,
  STATE_LABEL,
  VERDICT_LABEL,
  type Diagnostic,
  type DiagnosticPhoto,
  type DiagnosticSection,
  type DiagnosticState,
  type DiagnosticVerdict,
} from "@/lib/diagnostics";
import {
  Plus, Trash2, Upload, Eye, EyeOff, Loader2, Save, X, Camera,
} from "lucide-react";

/**
 * The Mazed diagnostic sheet, authored here and nowhere else.
 *
 * The "Vérifié et approuvé" badge on a listing is rendered from THIS document
 * being published — so the badge can never claim a check that isn't written
 * down. Draft while the car is still being looked at; publish when the sheet
 * is worth showing a buyer.
 *
 * Photos go into the public `properties` bucket under the admin's own uid
 * folder (the 0003 policy scopes writes by uid prefix), compressed client-side
 * like every other upload in the app.
 */

const STATE_TONE: Record<DiagnosticState, string> = {
  ok: "bg-[var(--success)]/12 text-[var(--success)] ring-1 ring-[var(--success)]/30",
  warn: "bg-[rgba(245,158,11,0.12)] text-[#92400e] ring-1 ring-[rgba(245,158,11,0.35)]",
  bad: "bg-[var(--accent-faint)] text-[var(--accent-deep)] ring-1 ring-[var(--accent-soft)]",
};

/** Starting skeleton for a car nobody has written up yet. */
const STARTER_SECTIONS: DiagnosticSection[] = [
  { title: "Moteur & mécanique", items: [] },
  { title: "Carrosserie & châssis", items: [] },
  { title: "Intérieur & électronique", items: [] },
  { title: "Documents & historique", items: [] },
];

const MAX_PHOTO_MB = 25;

export function DiagnosticEditor({
  propertyId,
  initial,
}: {
  propertyId: string;
  /** Existing sheet (draft or published), or null when none was ever written. */
  initial: Diagnostic | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);

  const [verdict, setVerdict] = useState<DiagnosticVerdict>(initial?.verdict ?? "approved");
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [inspectorName, setInspectorName] = useState(initial?.inspectorName ?? "Équipe Mazed");
  const [inspectedAt, setInspectedAt] = useState(
    initial?.inspectedAt ? initial.inspectedAt.slice(0, 10) : "",
  );
  const [sections, setSections] = useState<DiagnosticSection[]>(
    initial?.sections?.length ? initial.sections : STARTER_SECTIONS,
  );
  const [photos, setPhotos] = useState<DiagnosticPhoto[]>(initial?.photos ?? []);

  const published = initial?.status === "published";

  // ─── section / item plumbing ───────────────────────────────────────────
  function patchSection(i: number, next: Partial<DiagnosticSection>) {
    setSections((s) => s.map((sec, j) => (j === i ? { ...sec, ...next } : sec)));
  }
  function addItem(i: number) {
    patchSection(i, {
      items: [...sections[i].items, { label: "", state: "ok", note: null }],
    });
  }
  function patchItem(i: number, k: number, next: Partial<DiagnosticSection["items"][number]>) {
    patchSection(i, {
      items: sections[i].items.map((it, j) => (j === k ? { ...it, ...next } : it)),
    });
  }

  // ─── photos ────────────────────────────────────────────────────────────
  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setUploading(true);
    const supabase = getBrowserSupabase();
    try {
      const { data: auth } = await withTimeout(supabase.auth.getUser(), 15_000);
      if (!auth.user) {
        toast("Session expirée — reconnectez-vous.", "error");
        return;
      }
      const added: DiagnosticPhoto[] = [];
      for (const file of picked) {
        if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
          toast(`${file.name} : trop volumineux (max ${MAX_PHOTO_MB} Mo).`, "error");
          continue;
        }
        // Photos of DEFECTS need to stay readable when zoomed, so this uses the
        // document preset (webp, larger edge) rather than the listing preset.
        let out = file;
        try {
          out = await withTimeout(
            compressImage(file, { maxEdge: 2000, quality: 0.85, format: "webp" }),
            45_000,
          );
        } catch {
          out = file;
        }
        const ext = out.name.split(".").pop()?.toLowerCase() || "webp";
        const path = `${auth.user.id}/diag-${propertyId}-${Date.now()}-${added.length}.${ext}`;
        const { error } = await withTimeout(
          supabase.storage.from("properties").upload(path, out, {
            cacheControl: "31536000",
            upsert: false,
            contentType: out.type || "image/webp",
          }),
          120_000,
        );
        if (error) {
          toast(`Échec du téléversement : ${error.message}`, "error");
          continue;
        }
        added.push({ path, caption: null });
      }
      if (added.length) setPhotos((p) => [...p, ...added]);
    } catch (err) {
      toast(
        isTimeout(err) ? "Connexion trop lente — réessayez." : "Erreur réseau.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  // ─── save / publish / delete ───────────────────────────────────────────
  function save(nextStatus: "draft" | "published") {
    start(async () => {
      const res = await fetch(`/api/admin/diagnostics/${propertyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          verdict,
          headline,
          summary,
          inspector_name: inspectorName,
          inspected_at: inspectedAt || null,
          sections,
          photos,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.detail ?? j.error ?? `Échec de l'enregistrement (${res.status}).`, "error");
        return;
      }
      toast(
        nextStatus === "published"
          ? "Diagnostic publié — le badge apparaît sur l'annonce."
          : "Brouillon enregistré (non visible par les acheteurs).",
        "success",
      );
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await fetch(`/api/admin/diagnostics/${propertyId}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Échec de la suppression.", "error");
        return;
      }
      toast("Diagnostic supprimé — le badge disparaît de l'annonce.", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* State line — what a buyer sees right now. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-border">
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
          {published ? (
            <>
              <Eye className="size-3.5 text-[var(--success)]" />
              Publié — badge « {VERDICT_LABEL[verdict]} » visible sur l&apos;annonce
            </>
          ) : (
            <>
              <EyeOff className="size-3.5 text-muted" />
              {initial ? "Brouillon — invisible pour les acheteurs" : "Aucun diagnostic"}
            </>
          )}
        </span>
        {initial && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-deep)] hover:underline disabled:opacity-50"
          >
            <Trash2 className="size-3" /> Supprimer le diagnostic
          </button>
        )}
      </div>

      {/* Verdict */}
      <div>
        <Label>Verdict</Label>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DIAGNOSTIC_VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              className={
                "rounded-xl px-3 py-2.5 text-[12.5px] font-bold transition ring-1 " +
                (verdict === v
                  ? "bg-[var(--gold)] text-white ring-[var(--gold)]"
                  : "bg-surface text-foreground ring-border hover:ring-[var(--gold-soft)]")
              }
            >
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Contrôlé par" value={inspectorName} onChange={setInspectorName} placeholder="Équipe Mazed" />
        <label className="block">
          <Label>Date du contrôle</Label>
          <input
            type="date"
            value={inspectedAt}
            onChange={(e) => setInspectedAt(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      <Field
        label="Titre (une ligne, affichée en tête de la fiche)"
        value={headline}
        onChange={setHeadline}
        placeholder="Véhicule contrôlé sur 42 points — bon état général"
      />

      <label className="block">
        <Label>Résumé du diagnostic</Label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="Ce que nous avons constaté, en clair, pour un acheteur qui ne verra pas la voiture avant de se déplacer."
          className={INPUT}
        />
      </label>

      {/* ─── Checks ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Points contrôlés</Label>
          <button
            type="button"
            onClick={() => setSections((s) => [...s, { title: "", items: [] }])}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--gold)] hover:underline"
          >
            <Plus className="size-3" /> Ajouter une rubrique
          </button>
        </div>

        {sections.map((sec, i) => (
          <div key={i} className="rounded-xl bg-surface p-3 ring-1 ring-border">
            <div className="flex items-center gap-2">
              <input
                value={sec.title}
                onChange={(e) => patchSection(i, { title: e.target.value })}
                placeholder="Rubrique (ex. Moteur & mécanique)"
                className={INPUT + " font-bold"}
              />
              <button
                type="button"
                onClick={() => setSections((s) => s.filter((_, j) => j !== i))}
                aria-label="Retirer la rubrique"
                className="shrink-0 rounded-lg p-2 text-muted hover:text-[var(--accent-deep)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {sec.items.map((it, k) => (
                <div key={k} className="rounded-lg bg-surface-2 p-2.5 ring-1 ring-border">
                  <div className="flex items-center gap-2">
                    <input
                      value={it.label}
                      onChange={(e) => patchItem(i, k, { label: e.target.value })}
                      placeholder="Point contrôlé (ex. Embrayage)"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchSection(i, { items: sec.items.filter((_, j) => j !== k) })
                      }
                      aria-label="Retirer le point"
                      className="shrink-0 rounded-lg p-2 text-muted hover:text-[var(--accent-deep)]"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(["ok", "warn", "bad"] as DiagnosticState[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => patchItem(i, k, { state: st })}
                        className={
                          "rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.1em] transition " +
                          (it.state === st ? STATE_TONE[st] : "bg-surface text-muted ring-1 ring-border")
                        }
                      >
                        {STATE_LABEL[st]}
                      </button>
                    ))}
                    <input
                      value={it.note ?? ""}
                      onChange={(e) => patchItem(i, k, { note: e.target.value || null })}
                      placeholder="Note (visible par l'acheteur)"
                      className={INPUT + " flex-1 min-w-[160px]"}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(i)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--gold)] hover:underline"
              >
                <Plus className="size-3" /> Ajouter un point
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Photos ─── */}
      <div>
        <div className="flex items-center justify-between">
          <Label>Photos du diagnostic · {photos.length}</Label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-[var(--gold)] hover:underline">
            {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            {uploading ? "Téléversement…" : "Ajouter des photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPickPhotos}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>
        {photos.length === 0 ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <Camera className="size-3.5" />
            Nos propres photos : défauts constatés, compteur, numéro de série…
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((ph, i) => (
              <div key={ph.path} className="space-y-1">
                <div className="relative">
                  <ImageLightbox
                    src={propertyPhotoUrl(ph.path)}
                    alt={ph.caption ?? `Diagnostic ${i + 1}`}
                    triggerClassName="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={propertyPhotoUrl(ph.path)}
                      alt={ph.caption ?? `Diagnostic ${i + 1}`}
                      className="size-full object-cover"
                    />
                  </ImageLightbox>
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    aria-label="Retirer la photo"
                    className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white hover:bg-black/85"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <input
                  value={ph.caption ?? ""}
                  onChange={(e) =>
                    setPhotos((p) =>
                      p.map((q, j) => (j === i ? { ...q, caption: e.target.value || null } : q)),
                    )
                  }
                  placeholder="Légende"
                  className={INPUT + " text-[11px]"}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <AdminButton variant="ghost" onClick={() => save("draft")} pending={pending}>
          <Save className="size-3.5" /> Enregistrer le brouillon
        </AdminButton>
        <AdminButton variant="success" onClick={() => save("published")} pending={pending}>
          <Eye className="size-3.5" /> {published ? "Mettre à jour la fiche publiée" : "Publier le diagnostic"}
        </AdminButton>
        {published && (
          <AdminButton variant="warnSoft" onClick={() => save("draft")} pending={pending}>
            <EyeOff className="size-3.5" /> Dépublier
          </AdminButton>
        )}
      </div>
    </div>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-muted focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold-soft)]";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}
