"use client";

import { useCallback, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { withTimeout, isTimeout } from "@/lib/withTimeout";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, ArrowRight, Camera, Loader2, Star, Trash2 } from "lucide-react";

/**
 * Photos, uploaded the moment they are picked.
 *
 * The old wizard made this a step you waited on: pick everything, watch a
 * spinner, then continue. On a Tunisian mobile connection that is a minute of
 * dead time with nothing to do, and a dropped connection lost the lot. Here
 * each file starts uploading immediately and shows its own progress, so the
 * seller types the description while the pictures go up.
 *
 * The first photo is the cover — the one that decides whether anyone clicks the
 * annonce at all — so it is labelled as such and can be changed with one tap
 * rather than by guessing that order matters.
 */

export type UploadedPhoto = { path: string };

type Pending = { id: string; name: string; preview: string; failed?: boolean };

const MAX_PHOTO_MB = 25;

export function PhotoUploader({
  photos,
  onChange,
  userId,
  max = 12,
  disabled = false,
}: {
  photos: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  /**
   * Whose storage folder to upload into. Passed down from the server, which
   * already knows: asking `auth.getUser()` here cost a network round-trip PER
   * PHOTO before the upload could even start, and made every upload fail if
   * that one call was slow — which is exactly what it did on a first test.
   */
  userId: string;
  max?: number;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const room = max - photos.length - pending.length;

  const uploadOne = useCallback(
    async (file: File, tempId: string) => {
      const supabase = getBrowserSupabase();
      try {
        let out = file;
        try {
          out = await withTimeout(
            compressImage(file, { maxEdge: 1600, quality: 0.8, format: "webp" }),
            45_000,
          );
        } catch {
          out = file; // compression is an optimisation, not a gate
        }
        const ext = out.name.split(".").pop()?.toLowerCase() || "webp";
        const path = `${userId}/annonce-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error } = await withTimeout(
          supabase.storage.from("properties").upload(path, out, {
            cacheControl: "3600",
            upsert: false,
            contentType: out.type || "image/webp",
          }),
          120_000,
        );
        if (error) {
          toast(`« ${file.name} » n'a pas pu être envoyée.`, "error");
          return null;
        }
        return path;
      } catch (err) {
        toast(
          isTimeout(err) ? "Connexion trop lente — réessayez." : "Erreur réseau.",
          "error",
        );
        return null;
      } finally {
        setPending((p) => p.filter((x) => x.id !== tempId));
        URL.revokeObjectURL(tempId);
      }
    },
    [toast, userId],
  );

  const accept = useCallback(
    async (files: File[]) => {
      if (disabled) return;
      const usable = files.filter((f) => f.type.startsWith("image/"));
      if (usable.length === 0) return;
      if (room <= 0) {
        toast(`Maximum ${max} photos.`, "warning");
        return;
      }

      const batch = usable.slice(0, room);
      const tooBig = batch.filter((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
      for (const f of tooBig) toast(`« ${f.name} » dépasse ${MAX_PHOTO_MB} Mo.`, "error");
      const ok = batch.filter((f) => f.size <= MAX_PHOTO_MB * 1024 * 1024);

      // Show a local preview immediately — the seller sees their photo in the
      // grid before the network has done anything.
      const marks = ok.map((f) => ({
        id: URL.createObjectURL(f),
        name: f.name,
        preview: "",
      }));
      marks.forEach((m, i) => (m.preview = m.id) && i);
      setPending((p) => [...p, ...marks]);

      // Sequential rather than parallel: a phone uploading six photos at once
      // on 3G finishes them all late instead of the first one early.
      const added: UploadedPhoto[] = [];
      for (let i = 0; i < ok.length; i++) {
        const path = await uploadOne(ok[i], marks[i].id);
        if (path) {
          added.push({ path });
          onChange([...photos, ...added]);
        }
      }
    },
    [disabled, room, max, toast, uploadOne, onChange, photos],
  );

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length) return;
    const next = photos.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  }

  return (
    <div>
      {/* Drop zone / picker */}
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

      {(photos.length > 0 || pending.length > 0) && (
        <>
          <p className="mt-3 text-[11.5px] text-muted">
            La première photo est la couverture de votre annonce.
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <li
                key={p.path}
                className="group relative aspect-square overflow-hidden rounded-xl bg-black ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={propertyPhotoUrl(p.path)}
                  alt=""
                  className="size-full object-contain"
                />

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
                    onClick={() => onChange(photos.filter((_, j) => j !== i))}
                    aria-label="Supprimer la photo"
                    className="rounded p-1 text-white hover:text-[var(--danger,#f87171)]"
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
                className="relative aspect-square overflow-hidden rounded-xl bg-black ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="size-full object-contain opacity-40" />
                <span className="absolute inset-0 grid place-items-center">
                  <Loader2 className="size-5 animate-spin text-gold" />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
