"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { GOVERNORATES } from "@/lib/governorates";
import type { Plan } from "@/lib/shops/plans";
import { Car, Check, KeyRound, Loader2, Wrench } from "lucide-react";

const ACTIVITIES = [
  { value: "vente_auto", label: "Vente de véhicules", Icon: Car, body: "Voitures, utilitaires, motos." },
  { value: "location_auto", label: "Location de véhicules", Icon: KeyRound, body: "Prix par jour et conditions." },
  { value: "pieces_auto", label: "Pièces auto", Icon: Wrench, body: "Pièces neuves ou d'occasion." },
] as const;

const input =
  "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-foreground focus:border-[var(--gold)] focus:outline-none";

/**
 * Three choices, then payment. The shop is created as a draft before the plan
 * is paid, so an interrupted payment loses nothing: the dashboard picks up
 * where this left off.
 */
export function CreateShopWizard({ plans }: { plans: Plan[] }) {
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
      if (!created.ok && !shopId) return toast(created.j.detail ?? "Création impossible.", "error");
      if (!plan || plans.length === 0) {
        toast("Boutique enregistrée. Nous vous contactons pour l'ouvrir.", "success");
        return router.push("/pro/dashboard" as never);
      }
      const order = await post("/api/pro/checkout", { shop_id: shopId, plan_code: plan });
      if (!order.ok || !order.j.redirect) {
        toast(order.j.detail ?? "Paiement indisponible pour le moment. Votre boutique est enregistrée.", "error");
        return router.push("/pro/dashboard/abonnement" as never);
      }
      if (/^https?:\/\//.test(order.j.redirect)) window.location.assign(order.j.redirect);
      else router.push(order.j.redirect as never);
    } catch {
      toast("Erreur réseau.", "error");
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Activité", "Informations", "Formule"];

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
          {ACTIVITIES.map(({ value, label, Icon, body }) => (
            <button key={value} type="button" onClick={() => { setActivity(value); setStep(2); }}
              className={`flex items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition hover:border-gold-soft ${activity === value ? "border-gold-soft" : "border-border"}`}>
              <Icon className="size-6 shrink-0 text-gold" />
              <span>
                <span className="block text-[14.5px] font-extrabold">{label}</span>
                <span className="block text-[12.5px] text-muted">{body}</span>
              </span>
            </button>
          ))}
          <p className="text-[11.5px] text-muted">Une boutique a une activité. Elle détermine le nombre d&apos;annonces de votre formule.</p>
        </section>
      )}

      {step === 2 && (
        <section className="mt-5 space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block text-[12px] font-bold text-muted">Nom de la boutique
            <input className={input} value={info.name} maxLength={80} onChange={(e) => setInfo((s) => ({ ...s, name: e.target.value }))} placeholder="Auto Deal" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-bold text-muted">Gouvernorat
              <select className={input} value={info.governorate} onChange={(e) => setInfo((s) => ({ ...s, governorate: e.target.value }))}>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-bold text-muted">Ville
              <input className={input} value={info.city} maxLength={60} onChange={(e) => setInfo((s) => ({ ...s, city: e.target.value }))} />
            </label>
          </div>
          <label className="block text-[12px] font-bold text-muted">Téléphone de la boutique
            <input className={input} value={info.phone} inputMode="tel" onChange={(e) => setInfo((s) => ({ ...s, phone: e.target.value }))} placeholder="+216 …" />
          </label>
          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => setStep(1)} className="text-[13px] font-bold text-muted hover:text-foreground">Retour</button>
            <button type="button" disabled={info.name.trim().length < 2} onClick={() => setStep(3)}
              className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px] disabled:opacity-50">Continuer</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-5 space-y-3">
          {plans.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface p-4 text-[13px] text-muted">
              Les formules ne sont pas encore en vente. Votre boutique sera enregistrée et notre équipe vous contactera pour l&apos;ouvrir.
            </p>
          ) : (
            plans.map((p) => {
              const n = activity === "pieces_auto" ? `${p.limits.parts.toLocaleString("fr-FR")} pièces` : `${p.limits.vehicles} véhicules`;
              return (
                <button key={p.code} type="button" onClick={() => setPlan(p.code)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-left transition ${plan === p.code ? "border-gold-soft" : "border-border hover:border-gold-soft"}`}>
                  <span>
                    <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                      {plan === p.code && <Check className="size-4 text-gold" />} {p.name}
                    </span>
                    <span className="text-[12.5px] text-muted">{n} en ligne · {p.durationDays} jours</span>
                  </span>
                  <span className="batta-tabular text-[18px] font-black">{p.price.toLocaleString("fr-FR")} TND</span>
                </button>
              );
            })
          )}
          <p className="text-[11.5px] text-muted">
            Vous payez une période ; le renouvellement se fait à votre initiative, sans prélèvement automatique.
          </p>
          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => setStep(2)} className="text-[13px] font-bold text-muted hover:text-foreground">Retour</button>
            <button type="button" onClick={finish} disabled={busy}
              className="batta-btn-luxe tap-target inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {plans.length === 0 ? "Enregistrer ma boutique" : "Payer et ouvrir ma boutique"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
