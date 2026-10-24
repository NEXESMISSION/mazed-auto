"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import { TextField, FieldGrid, useAdminAction, EYEBROW } from "@/components/admin/kit";
import { Save, ArrowRight, Gift, Store } from "lucide-react";

/** The welcome allowance: the first `count` paid publications are offered. */
export type FreeListings = { enabled: boolean; count: number };

/** What a private seller may have live at once, and whether it is free (D-P1, 0189). */
export type PersonalLimits = { vehicles: number; parts: number; free: boolean };

export type PayeeSettings = {
  payee_name: string;
  payee_bank: string;
  payee_rib: string;
  payee_iban: string;
  payee_d17: string;
};

/**
 * The bank details a buyer is told to transfer to.
 *
 * Worth its own screen for one reason: these five strings are printed on the
 * checkout page and copied by hand into a banking app. A typo does not fail
 * loudly — it sends someone's money somewhere else and shows up days later as
 * "j'ai payé, où est mon annonce ?".
 *
 * Live example: `payee_name` currently reads "Batta Tunisia SARL", the name of
 * the twin real-estate project this codebase was forked from.
 */
export function SettingsForm({
  initial,
  initialFree,
  initialPersonal,
  initialProShops,
}: {
  initial: PayeeSettings;
  initialFree: FreeListings;
  initialPersonal: PersonalLimits;
  initialProShops: boolean;
}) {
  const t = useTranslations("admin.settings.form");
  const { run, pending, done } = useAdminAction();
  const [form, setForm] = useState<PayeeSettings>(initial);
  const [free, setFree] = useState<FreeListings>(initialFree);
  const freeAction = useAdminAction();
  const [personal, setPersonal] = useState<PersonalLimits>(initialPersonal);
  const personalAction = useAdminAction();
  const [proShops, setProShops] = useState(initialProShops);
  const shopsAction = useAdminAction();
  const personalDirty =
    personal.vehicles !== initialPersonal.vehicles
    || personal.parts !== initialPersonal.parts
    || personal.free !== initialPersonal.free;
  const whole = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

  const set = (k: keyof PayeeSettings) => (v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const dirty = (Object.keys(form) as (keyof PayeeSettings)[]).some(
    (k) => form[k] !== initial[k],
  );

  // The most likely wrong value in the whole console, and the most expensive.
  const looksForeign = /batta/i.test(form.payee_name);

  return (
    <div className="mt-7">
      <section className="border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("payee.title")}</h2>
        <p className="mt-1.5 text-[11.5px] text-subtle">
          {t("payee.body")}
        </p>

        {looksForeign && (
          <p className="mt-3 border-s-2 border-[var(--tone-warn)] ps-3 text-[12px] text-[var(--tone-warn)]">
            {t("payee.foreign")}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <TextField
            label={t("payee.name")}
            value={form.payee_name}
            onChange={set("payee_name")}
            placeholder="Mazed Auto SARL"
          />
          <FieldGrid>
            <TextField label={t("payee.bank")} value={form.payee_bank} onChange={set("payee_bank")} />
            <TextField
              label={t("payee.d17")}
              value={form.payee_d17}
              onChange={set("payee_d17")}
              type="tel"
            />
          </FieldGrid>
          <FieldGrid>
            <TextField label="RIB" value={form.payee_rib} onChange={set("payee_rib")} dir="ltr" />
            <TextField label="IBAN" value={form.payee_iban} onChange={set("payee_iban")} dir="ltr" />
          </FieldGrid>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={pending}
            done={done}
            doneLabel={t("saved")}
            disabled={!dirty}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              run({
                url: "/api/admin/settings",
                method: "POST",
                body: form,
                success: t("payee.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
          {dirty && (
            <span className="text-[11.5px] text-subtle">{t("unsaved")}</span>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("welcome.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("welcome.body")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={free.enabled}
              onChange={(e) => setFree((f) => ({ ...f, enabled: e.target.checked }))}
              className="size-4 accent-[var(--gold)]"
            />
            <span className="text-[13px] font-medium text-foreground">{t("welcome.enable")}</span>
          </label>

          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("welcome.count")}</span>
            <input
              type="number"
              min={0}
              max={50}
              value={free.count}
              onChange={(e) =>
                setFree((f) => ({ ...f, count: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))
              }
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
        </div>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Gift className="size-3.5 shrink-0" />
          {free.enabled && free.count > 0
            ? t("welcome.on", { count: free.count })
            : t("welcome.off")}
        </p>

        {/* Lowering the number never bills anyone retroactively: each waiver is
            recorded on the listing it applied to, so what is already given
            stays given. */}
        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={freeAction.pending}
            done={freeAction.done}
            doneLabel={t("saved")}
            disabled={free.enabled === initialFree.enabled && free.count === initialFree.count}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              freeAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { free_listings: free },
                success: t("welcome.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("personal.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("personal.body")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("personal.vehicles")}</span>
            <input
              type="number"
              min={0}
              max={20}
              value={personal.vehicles}
              onChange={(e) => setPersonal((p) => ({ ...p, vehicles: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("personal.parts")}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={personal.parts}
              onChange={(e) => setPersonal((p) => ({ ...p, parts: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={personal.free}
              onChange={(e) => setPersonal((p) => ({ ...p, free: e.target.checked }))}
              className="size-4 accent-[var(--gold)]"
            />
            <span className="text-[13px] font-medium text-foreground">{t("personal.free")}</span>
          </label>
        </div>

        <p className="mt-3 text-[12px] text-subtle">
          {personal.free
            ? t("personal.on", { vehicles: personal.vehicles, parts: personal.parts })
            : t("personal.off")}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={personalAction.pending}
            done={personalAction.done}
            doneLabel={t("saved")}
            disabled={!personalDirty}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              personalAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { personal_limits: personal },
                success: t("personal.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("shops.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("shops.body")}
        </p>

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={proShops}
            onChange={(e) => setProShops(e.target.checked)}
            className="size-4 accent-[var(--gold)]"
          />
          <span className="text-[13px] font-medium text-foreground">{t("shops.open")}</span>
        </label>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Store className="size-3.5 shrink-0" />
          {proShops ? t("shops.public") : t("shops.preview")}
          <Link href={"/boutiques" as never} className="font-medium text-[var(--gold)] hover:underline">
            {t("shops.see")}
          </Link>
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={shopsAction.pending}
            done={shopsAction.done}
            doneLabel={t("saved")}
            disabled={proShops === initialProShops}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              shopsAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { pro_shops: { enabled: proShops } },
                success: proShops ? t("shops.successPublic") : t("shops.successPreview"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("prices.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("prices.body")}
        </p>
        <Link
          href="/admin/offres"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--gold)] transition hover:gap-2"
        >
          {t("prices.open")}
          <ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2.2} />
        </Link>
      </section>
    </div>
  );
}
