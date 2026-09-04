"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { compressImage } from "@/lib/imageCompress";
import { avatarUrl } from "@/lib/avatar";

/**
 * Pick a photo, see it immediately, and it is on your listings.
 *
 * Compressed to a 512 px square-ish WebP before it leaves the phone: a profile
 * photo renders at 40–96 px, so a 4 MB camera original is 4 MB of someone's
 * data allowance spent on nothing. The preview is a local blob URL shown the
 * moment they pick, so the upload never feels like a wait.
 */
export function AvatarUploader({
  initialPath,
  name,
}: {
  initialPath: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const { toast, alert } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = preview ?? (path ? avatarUrl(path) : null);
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert({ title: "Choisissez une image", body: "JPG, PNG ou WebP.", variant: "warning" });
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: 512, quality: 0.82, format: "webp" });
      const ext = small.name.split(".").pop()?.toLowerCase() ?? "webp";

      const signed = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext }),
      });
      if (!signed.ok) throw new Error("Impossible de préparer l'envoi.");
      const { path: target, signedUrl } = (await signed.json()) as {
        path: string; signedUrl: string;
      };

      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", small);
      const put = await fetch(signedUrl, { method: "PUT", body: form });
      if (!put.ok) throw new Error("L'envoi de la photo a échoué.");

      const saved = await fetch("/api/account/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      if (!saved.ok) throw new Error("La photo n'a pas pu être enregistrée.");

      setPath(target);
      toast("Photo de profil mise à jour.", "success");
      router.refresh();
    } catch (err) {
      setPreview(null);
      alert({
        title: err instanceof Error ? err.message : "Erreur",
        body: "Réessayez dans un instant.",
        variant: "error",
      });
    } finally {
      setBusy(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPath(null);
      setPreview(null);
      router.refresh();
    } catch {
      alert({ title: "Suppression impossible", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-[26px] font-extrabold text-muted">
            {initial === "?" ? <User className="size-7" /> : initial}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="size-5 animate-spin text-white" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[14px] font-bold text-foreground">Photo de profil</div>
        <p className="mt-0.5 text-[12px] text-muted">
          Elle apparaît sur vos annonces. Un visage rassure un acheteur.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="tap-target inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-[12.5px] font-bold text-foreground transition hover:border-gold-soft disabled:opacity-60"
          >
            <Camera className="size-4" /> {path ? "Changer" : "Ajouter une photo"}
          </button>
          {path && !busy && (
            <button
              type="button"
              onClick={remove}
              className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-muted transition hover:text-[var(--danger)]"
            >
              <Trash2 className="size-4" /> Retirer
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="sr-only"
      />
    </div>
  );
}
