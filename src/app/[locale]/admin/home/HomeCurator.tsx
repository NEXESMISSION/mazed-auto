"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Star, StarOff, ImageIcon, Loader2, Check, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ListingImage } from "@/components/media/ListingImage";

export type CuratorPhoto = { id: string; storage_path: string; sort_order: number; is_cover: boolean };
export type CuratorRow = {
  id: string;
  title: string;
  governorate: string | null;
  featured_rank: number | null;
  photos: CuratorPhoto[];
};

/**
 * The two editorial decisions, on one screen.
 *
 * Before this, neither was a decision: "à la une" meant "posted most recently"
 * and the card image was whichever photo the seller happened to upload first —
 * which is how a brake-pad advert ended up showing an odometer.
 */
export function HomeCurator({
  rows,
  layout,
}: {
  rows: CuratorRow[];
  layout: { hero_slots: number; side_slots: number; fallback: string };
}) {
  const router = useRouter();
  const { toast, alert } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState(layout);

  async function call(method: string, body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch("/api/admin/home/listings", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert({ title: "Action impossible", body: j.error ?? "Réessayez.", variant: "error" });
        return false;
      }
      start(() => router.refresh());
      return true;
    } finally {
      setBusy(null);
    }
  }

  const featured = rows.filter((r) => r.featured_rank !== null)
    .sort((a, b) => (a.featured_rank ?? 0) - (b.featured_rank ?? 0));

  return (
    <div className="space-y-8">
      {/* ── Shape of the home page ── */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-extrabold">
          <Settings2 className="size-4 text-gold" /> Composition de l&apos;accueil
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Combien de places, et ce qui remplit celles que vous n&apos;avez pas choisies.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Grande place</span>
            <input type="number" min={0} max={3} value={form.hero_slots}
              onChange={(e) => setForm({ ...form, hero_slots: Number(e.target.value) })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Petites cartes</span>
            <input type="number" min={0} max={8} value={form.side_slots}
              onChange={(e) => setForm({ ...form, side_slots: Number(e.target.value) })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Le reste</span>
            <select value={form.fallback}
              onChange={(e) => setForm({ ...form, fallback: e.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]">
              <option value="recent">Les plus récentes</option>
              <option value="viewed">Les plus vues</option>
            </select>
          </label>
        </div>
        <button type="button" disabled={busy === "layout"}
          onClick={() => call("PUT", form, "layout").then((ok) => ok && toast("Composition enregistrée.", "success"))}
          className="batta-btn-luxe tap-target mt-4 inline-flex h-10 items-center gap-2 px-4 text-[13px]">
          {busy === "layout" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Enregistrer
        </button>
      </section>

      {/* ── Currently à la une ── */}
      <section>
        <h2 className="text-[15px] font-extrabold">À la une ({featured.length})</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Rang 1 en premier. Les places restantes se remplissent automatiquement.
        </p>
        {featured.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-[12.5px] text-muted">
            Aucune annonce mise en avant — l&apos;accueil affiche les plus récentes.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {featured.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gold-soft bg-gold-faint/30 p-2.5">
              <span className="batta-tabular grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--gold)] text-[13px] font-extrabold text-white">
                {r.featured_rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{r.title}</span>
              <button type="button" disabled={busy === r.id}
                onClick={() => call("POST", { listingId: r.id, rank: null }, r.id)}
                className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-muted hover:text-[var(--danger)]">
                <StarOff className="size-3.5" /> Retirer
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Every published annonce: feature it, and pick its photo ── */}
      <section>
        <h2 className="text-[15px] font-extrabold">Annonces publiées</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Cliquez une photo pour en faire l&apos;image de l&apos;annonce — celle qui
          s&apos;affiche partout sur le site.
        </p>
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{r.title}</span>
                  <span className="text-[11.5px] text-muted">{r.governorate ?? "—"}</span>
                </span>
                <input type="number" min={1} max={50} defaultValue={r.featured_rank ?? 1}
                  id={`rank-${r.id}`}
                  className="h-9 w-16 rounded-lg border border-border bg-surface-2 px-2 text-center text-[13px]" />
                <button type="button" disabled={busy === r.id}
                  onClick={() => {
                    const el = document.getElementById(`rank-${r.id}`) as HTMLInputElement | null;
                    call("POST", { listingId: r.id, rank: Number(el?.value || 1), days: 0 }, r.id)
                      .then((ok) => ok && toast("Mise à la une.", "success"));
                  }}
                  className="tap-target inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[12px] font-bold hover:border-gold-soft">
                  {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Star className="size-3.5" />}
                  À la une
                </button>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {r.photos.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                    <ImageIcon className="size-4" /> Aucune photo
                  </span>
                )}
                {r.photos.map((ph) => (
                  <button key={ph.id} type="button" disabled={busy === ph.id}
                    onClick={() => call("PATCH", { listingId: r.id, photoId: ph.id }, ph.id)
                      .then((ok) => ok && toast("Image de l'annonce mise à jour.", "success"))}
                    title={ph.is_cover ? "Image actuelle" : "Utiliser cette photo"}
                    className={`relative size-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                      ph.is_cover ? "ring-[var(--gold)]" : "ring-transparent hover:ring-gold-soft"
                    }`}>
                    <ListingImage path={ph.storage_path} alt="" sizes="80px" />
                    {ph.is_cover && (
                      <span className="absolute inset-x-0 bottom-0 bg-[var(--gold)] py-0.5 text-center text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">
                        Image
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {pending && <p className="text-[12px] text-muted">Mise à jour…</p>}
    </div>
  );
}
