"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { GOVERNORATES } from "@/lib/governorates";
import { planName, type Plan } from "@/lib/shops/plans";
import { governorateLabel } from "@/lib/labels";
import { currencyLabel, formatTND } from "@/lib/utils";
import { Car, Check, KeyRound, Loader2, Wrench } from "lucide-react";

const ACTIVITIES = [
  { value: "vente_auto", Icon: Car },
  { value: "location_auto", Icon: KeyRound },
  { value: "pieces_auto", Icon: Wrench },
] as const;

const input =
  "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-foreground focus:border-[var(--gold)] focus:outline-none";

/**
 * Three choices, then payment. The shop is created as a draft before the plan
 * is paid, so an interrupted payment loses nothing: the dashboard picks up
 * where this left off.
 */
export function CreateShopWizard({ plans }: { plans: Plan[] }) {
  const t = useTranslations("pro.create");
  const tb = useTranslations("pro.bucket");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [activity, setActivity] = useState<string>("");
  const [info, setInfo] = useState({ name: "", governorate: "Tunis", city: "", phone: "" });
  const [plan, setPlan] = useState<string>(plans[1]?.code ?? plans[0]?.code ?? "");
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, j: (await res.json().catch(() => ({}))) as { id?: string; redirect?: string; detail?: string; shopId?: string } };
  };

  async function finish() {
    setBusy(true);
    try {
      const created = await post("/api/pro/shops", { activity_type: activity, ...info });
      const shopId = created.j.id ?? created.j.shopId;
      if (!created.ok && !shopId) return toast(created.j.detail ?? t("failed"), "error");
      if (!plan || plans.length === 0) {
        toast(t("savedNoPlan"), "success");
        return router.push("/pro/dashboard" as never);
      }
      const order = await post("/api/pro/checkout", { shop_id: shopId, plan_code: plan });
      if (!order.ok || !order.j.redirect) {
        toast(order.j.detail ?? t("payUnavailable"), "error");
        return router.push("/pro/dashboard/abonnement" as never);
      }
      if (/^https?:\/\//.test(order.j.redirect)) window.location.assign(order.j.redirect);
      else router.push(order.j.redirect as never);
    } catch {
      toast(t("network"), "error");
    } finally {
      setBusy(false);
    }
  }

  const steps = [t("steps.activity"), t("steps.info"), t("steps.plan")];

  return (
    <div className="mt-6">
      <ol className="flex gap-1.5 text-[11.5px] font-bold sm:gap-2 sm:text-[12px]">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-center ring-1 sm:px-3 ${
            step === i + 1 ? "bg-gold-faint text-gold ring-gold-soft" : step > i + 1 ? "text-foreground ring-border" : "text-muted ring-border"
          }`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="mt-5 grid gap-3">
          {ACTIVITIES.map(({ value, Icon }) => (
            <button key={value} type="button" onClick={() => { setActivity(value); setStep(2); }}
              className={`flex items-center gap-3 rounded-2xl border bg-surface p-4 text-start transition hover:border-gold-soft ${activity === value ? "border-gold-soft" : "border-border"}`}>
              <Icon className="size-6 shrink-0 text-gold" />
              <span>
                <span className="block text-[14.5px] font-extrabold">{t(`activities.${value}.label`)}</span>
                <span className="block text-[12.5px] text-muted">{t(`activities.${value}.body`)}</span>
              </span>
            </button>
          ))}
          <p className="text-[11.5px] text-muted">{t("activityHint")}</p>
        </section>
      )}

      {step === 2 && (
        <section className="mt-5 space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block text-[12px] font-bold text-muted">{t("name")}
            <input className={input} value={info.name} maxLength={80} onChange={(e) => setInfo((s) => ({ ...s, name: e.target.value }))} placeholder="Auto Deal" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-bold text-muted">{t("governorate")}
              <select className={input} value={info.governorate} onChange={(e) => setInfo((s) => ({ ...s, governorate: e.target.value }))}>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{governorateLabel(g, locale)}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-bold text-muted">{t("city")}
              <input className={input} value={info.city} maxLength={60} onChange={(e) => setInfo((s) => ({ ...s, city: e.target.value }))} />
            </label>
          </div>
          <label className="block text-[12px] font-bold text-muted">{t("phone")}
            <input className={input} value={info.phone} inputMode="tel" dir="ltr" onChange={(e) => setInfo((s) => ({ ...s, phone: e.target.value }))} placeholder="+216 …" />
          </label>
          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => setStep(1)} className="text-[13px] font-bold text-muted hover:text-foreground">{t("back")}</button>
            <button type="button" disabled={info.name.trim().length < 2} onClick={() => setStep(3)}
              className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px] disabled:opacity-50">{t("continue")}</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-5 space-y-3">
          {plans.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface p-4 text-[13px] text-muted">
              {t("noPlans")}
            </p>
          ) : (
            plans.map((p) => {
              const parts = activity === "pieces_auto";
              const line = t("planLine", {
                count: formatTND(parts ? p.limits.parts : p.limits.vehicles, locale),
                bucket: tb(parts ? "parts" : "vehicles"),
                days: p.durationDays,
              });
              return (
                <button key={p.code} type="button" onClick={() => setPlan(p.code)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-start transition ${plan === p.code ? "border-gold-soft" : "border-border hover:border-gold-soft"}`}>
                  <span>
                    <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                      {plan === p.code && <Check className="size-4 text-gold" />} {planName(p, locale)}
                    </span>
                    <span className="text-[12.5px] text-muted">{line}</span>
                  </span>
                  <span className="batta-tabular text-[18px] font-black">{formatTND(p.price, locale)} {currencyLabel(locale)}</span>
                </button>
              );
            })
          )}
          <p className="text-[11.5px] text-muted">
            {t("renewHint")}
          </p>
          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => setStep(2)} className="text-[13px] font-bold text-muted hover:text-foreground">{t("back")}</button>
            <button type="button" onClick={finish} disabled={busy}
              className="batta-btn-luxe tap-target inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {plans.length === 0 ? t("save") : t("payAndOpen")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
