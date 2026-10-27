"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AdminButton } from "@/components/admin/AdminButton";
import { TextField, FieldGrid, SelectField, ToggleField, useAdminAction, EYEBROW } from "@/components/admin/kit";
import {
  DEFAULT_HOLDER, bankProblems, d17Problems, formatD17, formatIban, formatRib, konnectProblems, withRib,
  type PaymentMethods,
} from "@/lib/payments";
import type { KonnectStatus } from "@/lib/payments/konnectAccount";
import { Building2, CheckCircle2, CircleDashed, CreditCard, Save, Smartphone } from "lucide-react";

/**
 * One card per method: the switch that offers it to buyers, its details, what
 * is still missing, and what a buyer will read. Details can be saved while the
 * method is off — the accounts are often still being opened — and the server
 * refuses to switch one on that is incomplete, invalid or a sample.
 *
 * The Konnect key is write-only: typed here, encrypted by the server, and
 * from then on only its last four characters come back.
 */
export function PaymentMethodsForm({ initial, konnect }: { initial: PaymentMethods; konnect: KonnectStatus }) {
  const t = useTranslations("admin.payments");
  const { run, pending, done } = useAdminAction();
  const [m, setM] = useState<PaymentMethods>(initial);

  const [newKey, setNewKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  const bank = m.bank_transfer;
  const d17 = m.d17;
  const kon = m.konnect;
  const bankIssues = bankProblems(bank);
  const d17Issues = d17Problems(d17);
  const keyReady = newKey.trim().length > 0 || (Boolean(konnect.key?.readable) && !clearKey);
  // The environment's two keys are a complete account while nothing is typed here.
  const konnectIssues = konnect.env && !kon.wallet && !keyReady ? [] : konnectProblems(kon, keyReady);
  const keyLast4 = newKey.trim() ? newKey.trim().slice(-4) : !clearKey ? konnect.key?.last4 : undefined;
  // What is missing is worth saying once someone has started, or switched it on.
  // The holder comes filled in with the company, which is not a start.
  const bankStarted = bank.enabled || bank.holder !== DEFAULT_HOLDER || Boolean(bank.bank || bank.rib || bank.iban);
  const d17Started = d17.enabled || d17.holder !== DEFAULT_HOLDER || Boolean(d17.number);
  const konnectStarted = kon.enabled || Boolean(kon.wallet || newKey || konnect.key);
  const dirty = JSON.stringify(m) !== JSON.stringify(initial) || Boolean(newKey.trim()) || clearKey;
  // Switching on is refused by the server too; saying it here saves a round trip.
  const blocked =
    (bank.enabled && bankIssues.length > 0)
    || (d17.enabled && d17Issues.length > 0)
    || (kon.enabled && konnectIssues.length > 0);

  const setBank = (k: keyof PaymentMethods["bank_transfer"]) => (v: string | boolean) =>
    setM((s) => ({ ...s, bank_transfer: { ...s.bank_transfer, [k]: v } }));
  const setD17 = (k: keyof PaymentMethods["d17"]) => (v: string | boolean) =>
    setM((s) => ({ ...s, d17: { ...s.d17, [k]: v } }));
  const setKon = (k: keyof PaymentMethods["konnect"]) => (v: string | boolean) =>
    setM((s) => ({ ...s, konnect: { ...s.konnect, [k]: v } }));
  // The RIB is typed once: the IBAN (TN59 + RIB) and the bank its first two
  // digits name follow it.
  const setRib = (rib: string) => setM((s) => ({ ...s, bank_transfer: withRib(s.bank_transfer, rib) }));

  return (
    <div className="mt-7 space-y-8">
      <Method
        Icon={Building2}
        title={t("bank.title")}
        body={t("bank.body")}
        enabled={bank.enabled}
        onToggle={setBank("enabled")}
        issues={bankIssues.map((p) => t(`problems.bank.${p}`))}
        started={bankStarted}
        preview={[
          [t("preview.beneficiary"), bank.holder],
          [t("preview.bank"), bank.bank],
          ["RIB", formatRib(bank.rib)],
          ...(bank.iban ? [["IBAN", formatIban(bank.iban)] as [string, string]] : []),
        ]}
      >
        <TextField label={t("bank.holder")} value={bank.holder} onChange={setBank("holder")} placeholder={DEFAULT_HOLDER} hint={t("holderHint")} />
        <FieldGrid>
          <TextField label="RIB" value={bank.rib} onChange={setRib} dir="ltr" hint={t("bank.ribHint")} />
          <TextField label={t("bank.bank")} value={bank.bank} onChange={setBank("bank")} placeholder="BIAT, STB, Attijari…" hint={t("bank.bankHint")} />
        </FieldGrid>
        <TextField label="IBAN" value={bank.iban} onChange={setBank("iban")} dir="ltr" hint={t("bank.ibanHint")} />
      </Method>

      <Method
        Icon={Smartphone}
        title={t("d17.title")}
        body={t("d17.body")}
        enabled={d17.enabled}
        onToggle={setD17("enabled")}
        issues={d17Issues.map((p) => t(`problems.d17.${p}`))}
        started={d17Started}
        preview={[
          [t("preview.d17Number"), formatD17(d17.number)],
          [t("preview.beneficiary"), d17.holder],
        ]}
      >
        <FieldGrid>
          <TextField label={t("d17.number")} value={d17.number} onChange={setD17("number")} type="tel" placeholder="98 123 456" />
          <TextField label={t("d17.holder")} value={d17.holder} onChange={setD17("holder")} placeholder={DEFAULT_HOLDER} hint={t("holderHint")} />
        </FieldGrid>
      </Method>

      <Method
        Icon={CreditCard}
        title={t("konnect.title")}
        body={t("konnect.body")}
        enabled={kon.enabled}
        onToggle={setKon("enabled")}
        issues={konnectIssues.map((p) => t(`problems.konnect.${p}`))}
        started={konnectStarted}
        previewTitle={t("konnect.previewTitle")}
        preview={[
          [t("preview.gateway"), t(`konnect.modes.${kon.mode}`)],
          ...(kon.wallet ? [[t("preview.wallet"), kon.wallet] as [string, string]] : []),
          ...(keyLast4 ? [[t("preview.key"), `•••• ${keyLast4}`] as [string, string]] : []),
        ]}
      >
        <SelectField
          label={t("konnect.mode")}
          value={kon.mode}
          onChange={(v) => setKon("mode")(v === "live" ? "live" : "test")}
          options={(["test", "live"] as const).map((v) => ({ value: v, label: t(`konnect.modes.${v}`) }))}
          hint={t("konnect.modeHint")}
        />
        {/* Stored in lower case, as the server saves it: typed in capitals it would read as unsaved. */}
        <TextField label={t("konnect.wallet")} value={kon.wallet} onChange={(v) => setKon("wallet")(v.trim().toLowerCase())} dir="ltr" hint={t("konnect.walletHint")} />
        <TextField
          label={t("konnect.key")}
          type="password"
          value={newKey}
          onChange={(v) => { setNewKey(v); setClearKey(false); }}
          disabled={!konnect.canSaveKeys}
          placeholder={konnect.key && !clearKey ? `•••• ${konnect.key.last4}` : undefined}
          hint={
            !konnect.canSaveKeys ? t("konnect.noSecretKey")
            : konnect.key && !konnect.key.readable ? t("konnect.keyUnreadable")
            : konnect.key && clearKey ? t("konnect.forgetting")
            : konnect.key ? t("konnect.keySaved", { last4: konnect.key.last4 })
            : t("konnect.keyNone")
          }
        />
        {konnect.key && !newKey && (
          <button
            type="button"
            onClick={() => setClearKey((c) => !c)}
            className="text-[12px] font-medium text-[var(--gold)] hover:underline"
          >
            {clearKey ? t("konnect.forgetUndo") : t("konnect.forget")}
          </button>
        )}
        {konnect.env && <p className="text-[11.5px] text-muted">{t("konnect.env")}</p>}
      </Method>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <AdminButton
          variant="primary"
          size="md"
          pending={pending}
          done={done}
          doneLabel={t("saved")}
          disabled={!dirty || blocked}
          disabledReason={blocked ? t("blocked") : t("unchanged")}
          icon={<Save className="size-3.5" strokeWidth={2.4} />}
          onClick={() =>
            run({
              url: "/api/admin/payment-methods",
              method: "POST",
              body: { ...m, konnect_key: newKey.trim() || undefined, konnect_key_clear: clearKey || undefined },
              success: t("success"),
              // The key is gone from the page once saved; the refresh brings back its last four.
              onSuccess: () => { setNewKey(""); setClearKey(false); },
            })
          }
        >
          {t("save")}
        </AdminButton>
        <span className="text-[11.5px] text-subtle">
          {bank.enabled || d17.enabled || kon.enabled ? t("summaryOpen") : t("summaryClosed")}
        </span>
      </div>
    </div>
  );
}

function Status({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`ms-auto inline-flex items-center gap-1 text-[11.5px] font-semibold ${on ? "text-[var(--tone-ok)]" : "text-subtle"}`}>
      {on ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      {label}
    </span>
  );
}

function Method({
  Icon, title, body, enabled, onToggle, issues, started, preview, previewTitle, children,
}: {
  Icon: typeof Building2;
  title: string;
  body: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  issues: string[];
  /** Something typed, or switched on: then what is missing is worth listing. */
  started: boolean;
  preview: [string, string][];
  /** What the preview box is: what a buyer reads, by default. */
  previewTitle?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.payments");
  const complete = issues.length === 0;
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-subtle" />
        <h2 className={EYEBROW}>{title}</h2>
        <Status
          on={enabled && complete}
          label={enabled ? (complete ? t("status.open") : t("status.incomplete")) : t("status.closed")}
        />
      </div>
      <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">{body}</p>

      <div className="mt-4 max-w-xl space-y-4">
        <ToggleField checked={enabled} onChange={onToggle} label={t("offer")} hint={t("offerHint")} />
        {children}
      </div>

      {!complete && started && (
        <ul className="mt-3 max-w-xl space-y-1 border-s-2 border-[var(--tone-warn)] ps-3 text-[12px] text-[var(--tone-warn)]">
          {issues.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}

      {complete && (
        <div className="mt-4 max-w-xl rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{previewTitle ?? t("preview.title")}</p>
          <dl className="mt-2 space-y-1 text-[12.5px]">
            {preview.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-x-3">
                <dt className="text-subtle">{k}</dt>
                <dd className="font-semibold text-foreground"><span className="ltr-island">{v}</span></dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
