"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Star, StarOff, ImageIcon, Loader2, Check, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ListingImage } from "@/components/media/ListingImage";
import { governorateLabel } from "@/lib/labels";

export type CuratorPhoto = { id: string; storage_path: string; sort_order: number; is_cover: boolean };
export type CuratorRow = {
  id: string;
  title: string;
  governorate: string | null;
  featured_rank: number | null;
  boost: number | null;
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
  const t = useTranslations("admin.home.curator");
  const locale = useLocale();
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
        alert({ title: t("failedTitle"), body: j.error ?? t("retry"), variant: "error" });
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
          <Settings2 className="size-4 text-gold" /> {t("layoutTitle")}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {t("layoutBody")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t("heroSlots")}</span>
            <input type="number" min={0} max={3} value={form.hero_slots}
              onChange={(e) => setForm({ ...form, hero_slots: Number(e.target.value) })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t("sideSlots")}</span>
            <input type="number" min={0} max={8} value={form.side_slots}
              onChange={(e) => setForm({ ...form, side_slots: Number(e.target.value) })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t("fallback")}</span>
            <select value={form.fallback}
              onChange={(e) => setForm({ ...form, fallback: e.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px]">
              <option value="recent">{t("fallbackRecent")}</option>
              <option value="viewed">{t("fallbackViewed")}</option>
            </select>
          </label>
        </div>
        <button type="button" disabled={busy === "layout"}
          onClick={() => call("PUT", form, "layout").then((ok) => ok && toast(t("layoutSaved"), "success"))}
          className="batta-btn-luxe tap-target mt-4 inline-flex h-10 items-center gap-2 px-4 text-[13px]">
          {busy === "layout" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {t("save")}
        </button>
      </section>

      {/* ── Currently à la une ── */}
      <section>
        <h2 className="text-[15px] font-extrabold">{t("featuredTitle", { count: featured.length })}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {t("featuredBody")}
        </p>
        {featured.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-[12.5px] text-muted">
            {t("featuredEmpty")}
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
                <StarOff className="size-3.5" /> {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Every published annonce: feature it, and pick its photo ── */}
      <section>
        <h2 className="text-[15px] font-extrabold">{t("publishedTitle")}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {t("publishedBody")}
        </p>
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{r.title}</span>
                  <span className="text-[11.5px] text-muted">{r.governorate ? governorateLabel(r.governorate, locale) : "—"}</span>
                </span>
                {/* Two different powers, deliberately side by side.
                    « Poids » is a dial: it lifts or buries a listing across
                    every surface while still letting freshness and interest
                    compete. « À la une » is a pin: position N on the cover,
                    no argument. Most days the dial is the right tool. */}
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-muted">
                  {t("weight")}
                  <input
                    type="number" min={-100} max={100} step={10}
                    defaultValue={r.boost ?? 0}
                    id={`boost-${r.id}`}
                    title={t("weightHint")}
                    className="h-9 w-16 rounded-lg border border-border bg-surface-2 px-2 text-center text-[13px]"
                  />
                </label>
                <button type="button" disabled={busy === r.id}
                  onClick={() => {
                    const el = document.getElementById(`boost-${r.id}`) as HTMLInputElement | null;
                    call("PUT", { listingId: r.id, boost: Number(el?.value || 0) }, r.id)
                      .then((ok) => ok && toast(t("weightSaved"), "success"));
                  }}
                  className="tap-target inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-2 text-[12px] font-bold hover:border-gold-soft">
                  OK
                </button>
                <input type="number" min={1} max={50} defaultValue={r.featured_rank ?? 1}
                  id={`rank-${r.id}`}
                  title={t("rankHint")}
                  className="h-9 w-14 rounded-lg border border-border bg-surface-2 px-2 text-center text-[13px]" />
                <button type="button" disabled={busy === r.id}
                  onClick={() => {
                    const el = document.getElementById(`rank-${r.id}`) as HTMLInputElement | null;
                    call("POST", { listingId: r.id, rank: Number(el?.value || 1), days: 0 }, r.id)
                      .then((ok) => ok && toast(t("featuredDone"), "success"));
                  }}
                  className="tap-target inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[12px] font-bold hover:border-gold-soft">
                  {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Star className="size-3.5" />}
                  {t("feature")}
                </button>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {r.photos.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                    <ImageIcon className="size-4" /> {t("noPhoto")}
                  </span>
                )}
                {r.photos.map((ph) => (
                  <button key={ph.id} type="button" disabled={busy === ph.id}
                    onClick={() => call("PATCH", { listingId: r.id, photoId: ph.id }, ph.id)
                      .then((ok) => ok && toast(t("coverSaved"), "success"))}
                    title={ph.is_cover ? t("coverCurrent") : t("coverUse")}
                    className={`relative size-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                      ph.is_cover ? "ring-[var(--gold)]" : "ring-transparent hover:ring-gold-soft"
                    }`}>
                    <ListingImage path={ph.storage_path} alt="" sizes="80px" />
                    {ph.is_cover && (
                      <span className="absolute inset-x-0 bottom-0 batta-gold-fill py-0.5 text-center text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">
                        {t("coverBadge")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {pending && <p className="text-[12px] text-muted">{t("updating")}</p>}
    </div>
  );
}
