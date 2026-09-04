"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/imageCompress";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft, ArrowRight, Camera, CircleAlert, Loader2, RotateCw, Star, Trash2,
} from "lucide-react";

/**
 * Photos, uploaded the moment they are picked.
 *
 * TWO THINGS WERE WRONG BEFORE.
 *
 * The uploads hung. `supabase.storage.upload()` goes through supabase-js's auth
 * client, which serialises on the per-ORIGIN Web Lock `lock:sb-<ref>-auth-token`
 * — shared with every other tab on the site. One stalled auth operation
 * anywhere leaves the lock held and every upload queues behind it forever: no
 * HTTP request ever leaves the browser. This repo already hit it once and fixed
 * it for receipts; photos now take the same route — the server mints a signed
 * upload URL and the browser PUTs the bytes with a plain `fetch`. No auth
 * client, no lock, and a real AbortSignal so a stalled send can actually be
 * cancelled and retried.
 *
 * And the feedback lied. While photos were still going up, the step said
 * "Ajoutez au moins une photo" — telling the seller to do the thing they had
 * just done. Each photo now carries its own state (compression, sending,
 * failed) with a retry, the step reports how many are left, and "add a photo"
 * is only ever said when there genuinely are none.
 */

export type UploadedPhoto = { path: string };

type Pending = {
  id: string;
  file: File;
  preview: string;
  phase: "preparing" | "sending" | "failed";
  error?: string;
};

const MAX_PHOTO_MB = 25;

/** Bigger files get longer: a 20 MB photo on 3G is not a stalled one. */
const timeoutFor = (bytes: number) => Math.min(180_000, 30_000 + (bytes / 1e6) * 15_000);

export function PhotoUploader({
  photos,
  onChange,
  onPendingChange,
  max = 12,
  disabled = false,
}: {
  photos: UploadedPhoto[];
  /**
   * A setState-style updater, not a plain value. Uploads finish one after
   * another, so appending to the array captured when the batch started would
   * drop every photo but the last.
   */
  onChange: React.Dispatch<React.SetStateAction<UploadedPhoto[]>>;
  /** Lets the step above know uploads are still in flight. */
  onPendingChange?: (pending: number) => void;
  max?: number;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Report the in-flight count from an EFFECT, not from inside the state
  // updater. It used to be done in the `setPending` callback, which React is
  // free to run during render — so telling the parent from there was a
  // setState during another component's render, and React said so:
  //
  //   Cannot update a component (PublishWizard) while rendering a different
  //   component (PhotoUploader)
  //
  // Updater functions have to be pure. This one only computes the next list;
  // the parent hears about it afterwards.
  useEffect(() => {
    onPendingChange?.(pending.filter((x) => x.phase !== "failed").length);
  }, [pending, onPendingChange]);

  const room = max - photos.length - pending.length;

  /** Compress, get a signed URL, PUT the bytes. Returns the stored path. */
  const send = useCallback(
    async (file: File, tempId: string) => {
      const mark = (patch: Partial<Pending>) =>
        setPending((p) => p.map((x) => (x.id === tempId ? { ...x, ...patch } : x)));

      let out = file;
      try {
        out = await compressImage(file, { maxEdge: 1600, quality: 0.8, format: "webp" });
      } catch {
        out = file; // compression is an optimisation, not a gate
      }

      mark({ phase: "sending" });

      const ext = out.name.split(".").pop()?.toLowerCase() || "webp";
      try {
        const urlRes = await fetch("/api/annonces/photo-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exts: [ext] }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!urlRes.ok) {
          mark({ phase: "failed", error: "Le serveur a refusé l'envoi." });
          return null;
        }
        const { uploads } = (await urlRes.json()) as {
          uploads: { path: string; signedUrl: string }[];
        };
        const target = uploads?.[0];
        if (!target) {
          mark({ phase: "failed", error: "Réponse inattendue du serveur." });
          return null;
        }

        // Multipart with an empty field name is what the storage API expects
        // for a signed upload (see storage-js uploadToSignedUrl).
        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", out);

        const put = await fetch(target.signedUrl, {
          method: "PUT",
          body: form,
          signal: AbortSignal.timeout(timeoutFor(out.size)),
        });
        if (!put.ok) {
          mark({ phase: "failed", error: `Envoi refusé (${put.status}).` });
          return null;
        }

        setPending((p) => p.filter((x) => x.id !== tempId));
        URL.revokeObjectURL(tempId);
        return target.path;
      } catch (e) {
        const slow = e instanceof DOMException && e.name === "TimeoutError";
        mark({
          phase: "failed",
          error: slow ? "Connexion trop lente." : "Échec de l'envoi.",
        });
        return null;
      }
    },
    [],
  );

  const accept = useCallback(
    async (files: File[]) => {
      if (disabled) return;
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      if (room <= 0) {
        toast(`Maximum ${max} photos.`, "warning");
        return;
      }

      const batch = images.slice(0, room);
      for (const f of batch.filter((f) => f.size > MAX_PHOTO_MB * 1024 * 1024)) {
        toast(`« ${f.name} » dépasse ${MAX_PHOTO_MB} Mo.`, "error");
      }
      const ok = batch.filter((f) => f.size <= MAX_PHOTO_MB * 1024 * 1024);
      if (ok.length === 0) return;

      // Local previews first: the seller sees their photos in the grid before
      // the network has done anything at all.
      const marks: Pending[] = ok.map((f) => {
        const url = URL.createObjectURL(f);
        return { id: url, file: f, preview: url, phase: "preparing" as const };
      });
      setPending((p) => [...p, ...marks]);

      // One at a time: a phone pushing six photos at once on 3G finishes them
      // all late instead of the first one early.
      for (const m of marks) {
        const path = await send(m.file, m.id);
        if (path) onChange((prev) => [...prev, { path }]);
      }
    },
    [disabled, room, max, toast, send, onChange, ],
  );

  function retry(id: string) {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setPending((p) =>
      p.map((x) => (x.id === id ? { ...x, phase: "preparing", error: undefined } : x)),
    );
    void (async () => {
      const path = await send(item.file, item.id);
      if (path) onChange((prev) => [...prev, { path }]);
    })();
  }

  function move(from: number, to: number) {
    onChange((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  }

  const sending = pending.filter((p) => p.phase !== "failed").length;
  const failed = pending.filter((p) => p.phase === "failed").length;

  return (
    <div>
      <button
        type="button"
        disabled={disabled || room <= 0}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void accept(Array.from(e.dataTransfer.files));
        }}
        className={
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 transition " +
          (dragOver
            ? "border-gold bg-gold-faint"
            : "border-border bg-surface-2/40 hover:border-gold-soft") +
          (disabled || room <= 0 ? " cursor-not-allowed opacity-50" : "")
        }
      >
        <span className="grid size-11 place-items-center rounded-full bg-gold-faint text-gold">
          <Camera className="size-5" />
        </span>
        <span className="text-[13.5px] font-bold text-foreground">
          {photos.length === 0 ? "Ajoutez vos photos" : "Ajouter d'autres photos"}
        </span>
        <span className="text-[11.5px] text-muted">
          {room > 0
            ? `Jusqu'à ${max} photos · ${room} restante${room > 1 ? "s" : ""}`
            : `Maximum ${max} photos atteint`}
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void accept(files);
        }}
      />

      {/* What is happening right now — said once, above the grid. */}
      {sending > 0 && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-semibold text-gold ring-1 ring-gold-soft">
          <Loader2 className="size-3.5 animate-spin" />
          Envoi de {sending} photo{sending > 1 ? "s" : ""}… restez sur cette page.
        </p>
      )}
      {sending === 0 && failed > 0 && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-faint)] px-3 py-2 text-[12.5px] font-semibold text-[var(--accent-deep)]">
          <CircleAlert className="size-3.5" />
          {failed} photo{failed > 1 ? "s" : ""} n&apos;{failed > 1 ? "ont" : "a"} pas pu être
          envoyée{failed > 1 ? "s" : ""}. Réessayez ci-dessous.
        </p>
      )}
      {sending === 0 && failed === 0 && photos.length > 0 && (
        <p className="mt-3 text-[11.5px] text-muted">
          {photos.length} photo{photos.length > 1 ? "s" : ""} envoyée
          {photos.length > 1 ? "s" : ""} · la première est la couverture de votre annonce.
        </p>
      )}

      {(photos.length > 0 || pending.length > 0) && (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li
              key={p.path}
              className="group relative aspect-square overflow-hidden rounded-xl bg-black ring-1 ring-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={propertyPhotoUrl(p.path)} alt="" className="size-full object-contain" />

              {i === 0 && (
                <span className="absolute inset-x-1 top-1 inline-flex items-center justify-center gap-1 rounded-md bg-[var(--gold)] py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-black">
                  <Star className="size-2.5" /> Couverture
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 p-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  aria-label="Déplacer avant"
                  className="rounded p-1 text-white disabled:opacity-30"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Supprimer la photo"
                  className="rounded p-1 text-white"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === photos.length - 1}
                  aria-label="Déplacer après"
                  className="rounded p-1 text-white disabled:opacity-30"
                >
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </li>
          ))}

          {pending.map((p) => (
            <li
              key={p.id}
              className={
                "relative aspect-square overflow-hidden rounded-xl bg-black ring-1 " +
                (p.phase === "failed" ? "ring-[var(--accent-deep)]" : "ring-border")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-full object-contain opacity-35" />

              {p.phase === "failed" ? (
                <div className="absolute inset-0 grid place-items-center gap-1 p-1 text-center">
                  <button
                    type="button"
                    onClick={() => retry(p.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--gold)] px-2 py-1 text-[10px] font-extrabold text-black"
                  >
                    <RotateCw className="size-3" /> Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending((s) => s.filter((x) => x.id !== p.id));
                      URL.revokeObjectURL(p.id);
                    }}
                    className="text-[9.5px] font-bold text-white/70 underline"
                  >
                    Retirer
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center gap-1">
                  <Loader2 className="size-5 animate-spin text-gold" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/80">
                    {p.phase === "preparing" ? "Préparation" : "Envoi"}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
