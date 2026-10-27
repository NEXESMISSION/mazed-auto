"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { Loader2, PencilLine, Save } from "lucide-react";

type Quick = { price: string; onRequest: boolean; negotiable: boolean; showPhone: boolean };

/**
 * The two halves of « Modifier »: what changes at once (the annonce stays
 * online) and what goes back to review (it comes off the catalogue until it
 * is approved again — said before, and asked once).
 */
export function EditListingForm({
  listingId, title, canReopen, initial,
}: {
  listingId: string;
  title: string;
  /** Only the seller reopens the content: the wizard opens their own annonces. */
  canReopen: boolean;
  initial: Quick;
}) {
  const t = useTranslations("myAccount.listings.edit");
  const tc = useTranslations("myAccount.common");
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState<Quick>(initial);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const dirty = JSON.stringify(q) !== JSON.stringify(initial);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/annonces/${listingId}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, j: (await res.json().catch(() => ({}))) as { detail?: string; href?: string } };
  }

  async function save() {
    setSaving(true);
    try {
      const { res, j } = await post({
        price: q.onRequest ? null : q.price,
        price_on_request: q.onRequest,
        negotiable: q.negotiable,
        show_phone: q.showPhone,
      });
      if (!res.ok) {
        toast(j.detail ?? t("failed"), "error");
        return;
      }
      toast(t("saved"), "success");
      router.push("/account/listings");
      router.refresh();
    } catch {
      toast(tc("networkError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    if (!window.confirm(t("contentConfirm", { title }))) return;
    setReopening(true);
    try {
      const { res, j } = await post({ reopen: true });
      if (!res.ok || !j.href) {
        toast(j.detail ?? t("contentFailed"), "error");
        return;
      }
      router.push(j.href as never);
    } catch {
      toast(tc("networkError"), "error");
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold text-foreground">{t("quickTitle")}</h2>
        <p className="mt-1 text-[12.5px] text-muted">{t("quickBody")}</p>

        <label className="mt-4 block">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-subtle">{t("price")}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={q.price}
            disabled={q.onRequest}
            onChange={(e) => setQ((s) => ({ ...s, price: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-[16px] font-bold text-foreground focus:border-gold focus:outline-none disabled:opacity-40"
          />
        </label>

        <div className="mt-3 space-y-2.5">
          <Check label={t("onRequest")} checked={q.onRequest} onChange={(v) => setQ((s) => ({ ...s, onRequest: v }))} />
          <Check label={t("negotiable")} checked={q.negotiable} onChange={(v) => setQ((s) => ({ ...s, negotiable: v }))} />
          <Check label={t("showPhone")} checked={q.showPhone} onChange={(v) => setQ((s) => ({ ...s, showPhone: v }))} />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="batta-btn-luxe tap-target mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("save")}
        </button>
      </section>

      {canReopen && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-[14px] font-extrabold text-foreground">{t("contentTitle")}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t("contentBody")}</p>
          <button
            type="button"
            onClick={reopen}
            disabled={reopening}
            className="tap-target mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-[13px] font-bold text-foreground transition hover:border-gold-soft disabled:opacity-50"
          >
            {reopening ? <Loader2 className="size-4 animate-spin" /> : <PencilLine className="size-4" />}
            {t("contentButton")}
          </button>
        </section>
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--gold)]"
      />
      {label}
    </label>
  );
}
