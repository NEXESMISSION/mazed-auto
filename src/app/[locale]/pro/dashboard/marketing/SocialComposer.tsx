"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { CheckCircle2, ExternalLink, Facebook, Images, Instagram, Loader2, Send, Sparkles } from "lucide-react";

type Network = "facebook" | "instagram";
type Variant = {
  id: string; network: Network; body: string; hashtags: string[]; media: { url: string }[];
  source: "ai" | "template" | "edited"; version: number; note?: string | null;
};
type Draft = Variant & { tags: string; validated: boolean; saving: boolean; error: string | null };
type Result = { network: Network; job_id: string | null; outcome: { status: string; url?: string | null; error?: string } };

/**
 * The publication flow of lot S1, in the order the brief sets (§5): pick an
 * online annonce and the networks (none ticked by default), get a draft per
 * network, read / edit / validate each one, choose the accounts, give the
 * consent, publish. The server checks every step again; this screen only
 * keeps them in order.
 */
export function SocialComposer({
  listings,
  accounts,
  aiEnabled,
}: {
  listings: { id: string; label: string }[];
  accounts: { id: string; network: Network; name: string }[];
  aiEnabled: boolean;
}) {
  const t = useTranslations("social");
  const router = useRouter();
  const { toast } = useToast();
  const [listingId, setListingId] = useState("");
  const [networks, setNetworks] = useState<Network[]>([]);
  const [language, setLanguage] = useState<"fr" | "tn">("fr");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [chosen, setChosen] = useState<Partial<Record<Network, string>>>({});
  const [consent, setConsent] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j };
  };

  async function prepare() {
    setBusy(true);
    try {
      const { ok, j } = await call("/api/pro/social/requests", "POST", { listing_id: listingId, networks, language });
      if (!ok) return toast(j.detail ?? t("composer.error"), "error");
      setRequestId(j.id);
      setDrafts((j.variants as Variant[]).map((v) => ({ ...v, tags: v.hashtags.join(" "), validated: false, saving: false, error: null })));
      const pre: Partial<Record<Network, string>> = {};
      for (const n of networks) {
        const own = accounts.filter((a) => a.network === n);
        if (own.length === 1) pre[n] = own[0].id;
      }
      setChosen(pre);
    } catch {
      toast(t("composer.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  const update = (id: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  async function validate(d: Draft) {
    update(d.id, { saving: true, error: null });
    const { ok, j } = await call(`/api/pro/social/variants/${d.id}`, "PATCH", { body: d.body, hashtags: d.tags.split(/\s+/).filter(Boolean), validate: true });
    if (!ok) return update(d.id, { saving: false, error: j.detail ?? t("composer.error") });
    update(d.id, { saving: false, validated: true, body: j.body, hashtags: j.hashtags, tags: (j.hashtags as string[]).join(" "), source: j.source, version: j.version });
  }

  async function publish() {
    if (!requestId) return;
    setBusy(true);
    try {
      const { ok, j } = await call(`/api/pro/social/requests/${requestId}/publish`, "POST", { consent, accounts: chosen });
      if (!ok) return toast(j.detail ?? t("composer.error"), "error");
      setResults(j.results);
      router.refresh();
    } catch {
      toast(t("composer.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setRequestId(null); setDrafts([]); setResults(null); setConsent(false); setChosen({}); setNetworks([]); setListingId("");
  }

  const ready = drafts.length > 0 && drafts.every((d) => d.validated && chosen[d.network]) && consent;
  const NetIcon = ({ n }: { n: Network }) => (n === "instagram" ? <Instagram className="size-4" /> : <Facebook className="size-4" />);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-[14px] font-extrabold">{t("composer.title")}</h3>

      {!requestId && (
        <div className="mt-3 space-y-3">
          {listings.length === 0 ? (
            <p className="text-[12.5px] text-muted">{t("composer.noListings")}</p>
          ) : (
            <>
              <label className="block text-[12px] font-bold text-muted">
                {t("composer.listing")}
                <select value={listingId} onChange={(e) => setListingId(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-foreground">
                  <option value="">{t("composer.pickListing")}</option>
                  {listings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </label>
              <fieldset>
                <legend className="text-[12px] font-bold text-muted">{t("composer.networks")}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["facebook", "instagram"] as const).map((n) => {
                    const on = networks.includes(n);
                    return (
                      <label key={n} className={`tap-target inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-bold ${on ? "border-gold-soft bg-gold-faint text-gold" : "border-border text-muted"}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => setNetworks(on ? networks.filter((x) => x !== n) : [...networks, n])} />
                        <NetIcon n={n} /> {t(`composer.networkName.${n}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-[12px] font-bold text-muted">{t("composer.language")}</legend>
                <div className="mt-1 flex gap-2">
                  {(["fr", "tn"] as const).map((l) => (
                    <label key={l} className={`tap-target inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-[13px] font-bold ${language === l ? "border-gold-soft bg-gold-faint text-gold" : "border-border text-muted"}`}>
                      <input type="radio" className="sr-only" name="social-lang" checked={language === l} onChange={() => setLanguage(l)} />
                      {t(`composer.lang.${l}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" /> {aiEnabled ? t("composer.ai") : t("composer.noAi")}
              </p>
              <button type="button" disabled={!listingId || networks.length === 0 || busy} onClick={prepare} className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] disabled:opacity-50">
                {busy && <Loader2 className="size-4 animate-spin" />} {t("composer.prepare")}
              </button>
            </>
          )}
        </div>
      )}

      {requestId && !results && (
        <div className="mt-3 space-y-4">
          {drafts.map((d) => {
            const own = accounts.filter((a) => a.network === d.network);
            const first = d.media[0]?.url;
            return (
              <article key={d.id} className="rounded-xl border border-border p-3">
                <header className="flex flex-wrap items-center gap-2 text-[13px] font-extrabold">
                  <NetIcon n={d.network} /> {t(`composer.networkName.${d.network}`)}
                  <span className="text-[11px] font-bold text-muted">· {t(`composer.source.${d.source}`)}</span>
                  {d.validated && <span className="batta-tone-ok ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"><CheckCircle2 className="size-3" /> {t("composer.validated")}</span>}
                </header>
                {d.note && <p className="batta-tone-warn mt-2 rounded-lg px-3 py-1.5 text-[11.5px]">{d.note}</p>}

                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-2">
                    <label className="block text-[11.5px] font-bold text-muted">
                      {t("composer.body")}
                      <textarea
                        value={d.body}
                        rows={7}
                        dir="auto"
                        onChange={(e) => update(d.id, { body: e.target.value, validated: false })}
                        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-foreground"
                      />
                    </label>
                    <label className="block text-[11.5px] font-bold text-muted">
                      {t("composer.hashtags")}
                      <input value={d.tags} dir="auto" onChange={(e) => update(d.id, { tags: e.target.value, validated: false })} className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground" />
                    </label>
                    {d.error && <p className="text-[11.5px] text-[var(--danger)]">{d.error}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" disabled={d.saving || d.validated} onClick={() => validate(d)} className="tap-target inline-flex items-center gap-1.5 rounded-xl border border-gold-soft px-3 py-2 text-[12.5px] font-bold text-gold disabled:opacity-50">
                        {d.saving && <Loader2 className="size-3.5 animate-spin" />} {t("composer.validate")}
                      </button>
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted"><Images className="size-3.5" /> {t("composer.photos", { count: d.media.length })}</span>
                    </div>
                  </div>

                  {/* What the network will show, roughly: the first photo and the text. */}
                  <div className="overflow-hidden rounded-xl border border-border bg-surface-2 text-[12px]">
                    {first && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={first} alt="" className={`w-full object-cover ${d.network === "instagram" ? "aspect-square" : "aspect-[4/3]"}`} />
                    )}
                    <p dir="auto" className="whitespace-pre-line p-2.5 leading-relaxed">{d.body}</p>
                    {d.tags && <p dir="auto" className="px-2.5 pb-2.5 text-gold">{d.tags}</p>}
                  </div>
                </div>

                <label className="mt-3 block text-[11.5px] font-bold text-muted">
                  {t("composer.account")}
                  {own.length === 0 ? (
                    <span className="mt-1 block font-normal">{t("composer.noAccount", { network: t(`composer.networkName.${d.network}`) })}</span>
                  ) : (
                    <select value={chosen[d.network] ?? ""} onChange={(e) => setChosen({ ...chosen, [d.network]: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground">
                      <option value="" />
                      {own.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </label>
              </article>
            );
          })}

          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-[12.5px] leading-relaxed">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>{t("composer.consent")}</span>
          </label>
          {!ready && <p className="text-[11.5px] text-muted">{t("composer.needs")}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!ready || busy} onClick={publish} className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 rtl:-scale-x-100" />} {t("composer.publish")}
            </button>
            <button type="button" onClick={restart} className="tap-target rounded-xl border border-border px-3 py-2 text-[12.5px] font-bold text-muted">{t("composer.restart")}</button>
          </div>
        </div>
      )}

      {results && (
        <div className="mt-3 space-y-2">
          {results.map((r) => (
            <p key={r.network} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] ${r.outcome.status === "published" ? "batta-tone-ok" : "batta-tone-warn"}`}>
              <NetIcon n={r.network} />
              {t(`results.${r.outcome.status as "published"}`, { error: r.outcome.error ?? "" })}
              {r.outcome.url && (
                <a href={r.outcome.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-bold underline">
                  {t("results.view")} <ExternalLink className="size-3" />
                </a>
              )}
            </p>
          ))}
          <button type="button" onClick={restart} className="tap-target rounded-xl border border-border px-3 py-2 text-[12.5px] font-bold text-muted">{t("composer.restart")}</button>
        </div>
      )}
    </section>
  );
}
