/* eslint-disable react-hooks/purity -- Server Component: reads the clock once
 * per request to tell current periods from past ones. */
import { Link } from "@/i18n/navigation";
import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { planLimitFor, plansForSale } from "@/lib/shops/plans";
import { PostButton } from "../PostButton";
import { PaymentStatus } from "./PaymentStatus";
import { CreditCard, FileText } from "lucide-react";

const PAY_STATUS: Record<string, string> = {
  pending: "À régler",
  pending_review: "Reçu en vérification",
  captured: "Payé",
  failed: "Non abouti",
  refunded: "Remboursé",
};
const PROVIDER: Record<string, string> = {
  konnect: "Paiement en ligne",
  bank_transfer: "Virement / D17",
  manual: "Virement / D17",
};

/**
 * Abonnement — the shop's periods, the plans it can buy next, and every
 * payment it made, with its receipt. Renewal is explicit: buying a plan
 * while a period is running adds the next period after it (0191).
 */
export default async function ProSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop, role } = ctx;
  const sp = await searchParams;
  const canBuy = CAN_EDIT_SHOP.includes(role) && !["suspended", "closed", "rejected"].includes(shop.status);

  const [plans, subRes, payRes] = await Promise.all([
    plansForSale(admin),
    admin
      .from("subscriptions")
      .select("id, starts_at, ends_at, grace_ends_at, status, reason, limits, product:products (name_fr, plan_code)")
      .eq("shop_id", shop.id)
      .order("starts_at", { ascending: false })
      .limit(12),
    admin
      .from("payments")
      .select("id, kind, amount, status, provider, created_at, receipt_number, metadata")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  type Sub = {
    id: string; starts_at: string; ends_at: string; grace_ends_at: string; status: string; reason: string | null;
    limits: { vehicles: number; parts: number };
    product: { name_fr: string; plan_code: string } | { name_fr: string; plan_code: string }[] | null;
  };
  // The 12 latest periods, read in the order they run.
  const subs = ((subRes.data ?? []) as unknown as Sub[]).reverse();
  const now = Date.now();
  const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const name = (s: Sub) => (Array.isArray(s.product) ? s.product[0]?.name_fr : s.product?.name_fr) ?? "—";
  const current = subs.find((s) => new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime());
  const currentCode = current ? (Array.isArray(current.product) ? current.product[0]?.plan_code : current.product?.plan_code) : null;

  return (
    <div className="space-y-5">
      {sp.payment && /^[0-9a-f-]{36}$/i.test(sp.payment) && <PaymentStatus paymentId={sp.payment} />}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">Périodes</h2>
        {subs.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Aucun abonnement pour l&apos;instant.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {subs.map((s) => {
              const start = new Date(s.starts_at).getTime();
              const end = new Date(s.ends_at).getTime();
              const state = start > now ? "À venir" : now < end ? "En cours" : now < new Date(s.grace_ends_at).getTime() ? "Grâce" : "Terminée";
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <span className="font-bold">{name(s)}</span>
                  <span className="text-muted">{date(s.starts_at)} → {date(s.ends_at)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${state === "En cours" ? "batta-tone-ok" : state === "Grâce" ? "batta-tone-warn" : "bg-surface-2 text-muted ring-1 ring-border"}`}>
                    {state}{s.reason === "migration" ? " · offerte" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{current ? "Renouveler ou changer de formule" : "Choisir une formule"}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          {current
            ? "Une nouvelle période commence à la fin de celle en cours : vous ne perdez aucun jour. Si la formule choisie permet moins d'annonces, les plus anciennes passent en pause et vous choisissez ensuite lesquelles garder."
            : shop.status === "draft"
              ? "Votre boutique ouvre dès que le paiement est confirmé."
              : "La période commence dès que le paiement est confirmé ; vos annonces mises en pause reviennent en ligne."}{" "}
          Aucun prélèvement automatique.
        </p>
        {plans.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">
            Les formules ne sont pas encore en vente. <Link href={"/contact" as never} className="font-bold text-gold hover:underline">Contactez-nous</Link>.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {plans.map((p) => {
              const lim = planLimitFor(p, shop.activity_type);
              return (
                <div key={p.code} className={`rounded-xl border p-3 ${currentCode === p.code ? "border-gold-soft" : "border-border"}`}>
                  <p className="font-extrabold">{p.name}{currentCode === p.code && <span className="ms-1 text-[11px] font-bold text-gold">· actuelle</span>}</p>
                  <p className="batta-tabular text-[18px] font-black">{p.price.toLocaleString("fr-FR")} TND</p>
                  <p className="text-[11.5px] text-muted">{lim.n.toLocaleString("fr-FR")} {lim.word} · {p.durationDays} jours</p>
                  {canBuy && (
                    <PostButton
                      url="/api/pro/checkout"
                      body={{ shop_id: shop.id, plan_code: p.code }}
                      className="batta-btn-luxe tap-target mt-2 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12.5px]"
                    >
                      <CreditCard className="size-3.5" /> {current && currentCode === p.code ? "Renouveler" : "Choisir"}
                    </PostButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">Paiements</h2>
        {(payRes.data ?? []).length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Aucun paiement.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {(payRes.data ?? []).map((p) => (
              <li key={p.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="font-bold">
                  {p.kind === "subscription" ? "Abonnement" : "Boost 7 jours"} · {Number(p.amount).toLocaleString("fr-FR")} TND
                </span>
                <span className="text-muted">{date(p.created_at as string)} · {PROVIDER[p.provider as string] ?? p.provider}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{PAY_STATUS[p.status as string] ?? p.status}</span>
                  {p.status === "captured" && (
                    <Link href={`/pro/dashboard/abonnement/recu/${p.id}` as never} className="inline-flex items-center gap-1 font-bold text-gold hover:underline">
                      <FileText className="size-3.5" /> Reçu {p.receipt_number as string}
                    </Link>
                  )}
                  {p.status === "pending" && p.provider !== "konnect" && (
                    <Link href={`/payment/checkout?payment=${p.id}` as never} className="font-bold text-gold hover:underline">Régler</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
