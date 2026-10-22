/* eslint-disable react-hooks/purity -- Server Component.
 * Reads the clock once per request to say how many days a subscription has
 * left; there is no client render to replay. */
import { Link } from "@/i18n/navigation";
import { getProContext } from "@/lib/shops/proContext";
import { quotaStatus } from "@/lib/shops/server";
import { shopsGate } from "@/lib/shops/public";
import { isShopVerified } from "@/lib/shops/format";
import type { ListingType } from "@/lib/publication";
import { AlertTriangle, BadgeCheck, CalendarClock, Eye, Megaphone, Plus } from "lucide-react";

/**
 * Résumé — where the shop stands: its subscription and when it ends, how much
 * of its quota is live, whether it is verified, and anything that needs doing.
 * Every number comes from the same functions that enforce them
 * (`listing_quota_status`, `shop_current_subscription`, 0188–0189).
 */
export default async function ProSummaryPage() {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null; // the layout already answered
  const { admin, user, shop } = ctx;

  const [quota, subRes, countRes, gate] = await Promise.all([
    quotaStatus(admin, user.id, shop.id, shop.activity_type as ListingType),
    admin
      .from("subscriptions")
      .select("starts_at, ends_at, grace_ends_at, status, reason, product:products (name_fr)")
      .eq("shop_id", shop.id)
      .neq("status", "cancelled")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("listings").select("status").eq("shop_id", shop.id),
    shopsGate(admin),
  ]);

  const sub = subRes.data as
    | { starts_at: string; ends_at: string; grace_ends_at: string; status: string; reason: string | null;
        product: { name_fr: string } | { name_fr: string }[] | null }
    | null;
  const planName = sub ? (Array.isArray(sub.product) ? sub.product[0]?.name_fr : sub.product?.name_fr) ?? "—" : null;
  const now = Date.now();
  const daysLeft = sub ? Math.ceil((new Date(sub.ends_at).getTime() - now) / 86_400_000) : null;
  const current = sub != null && daysLeft != null && daysLeft > 0;
  const inGrace = sub != null && !current && new Date(sub.grace_ends_at).getTime() > now;

  const counts: Record<string, number> = {};
  for (const r of countRes.data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  const bucketWord = quota.bucket === "parts" ? "pièces" : "véhicules";
  const pct = quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // What needs doing, most urgent first.
  const alerts: { tone: "bad" | "warn"; text: string; href?: string; cta?: string }[] = [];
  if (shop.status === "suspended") {
    alerts.push({ tone: "bad", text: `Boutique suspendue${shop.rejection_reason ? ` : ${shop.rejection_reason}` : "."} Ses annonces ne peuvent pas être mises en ligne.` });
  } else if (shop.status !== "active") {
    alerts.push({ tone: "warn", text: "Boutique en attente de validation par notre équipe." });
  }
  if (!current && !inGrace) {
    alerts.push({ tone: "bad", text: "Aucun abonnement en cours : vos annonces ne peuvent pas être mises en ligne." });
  } else if (inGrace) {
    alerts.push({ tone: "bad", text: `Abonnement terminé le ${date(sub!.ends_at)}. Vos annonces restent en ligne jusqu'au ${date(sub!.grace_ends_at)}, mais rien de nouveau ne part.` });
  } else if (daysLeft != null && daysLeft <= 14) {
    alerts.push({ tone: "warn", text: `Votre abonnement se termine dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}, le ${date(sub!.ends_at)}.` });
  }
  if (quota.limit > 0 && quota.remaining === 0) {
    alerts.push({ tone: "warn", text: `Les ${quota.limit} ${bucketWord} de votre formule sont en ligne : retirez-en une pour en publier une autre.`, href: "/pro/dashboard/annonces", cta: "Gérer" });
  }
  const missing = [!shop.logo_path && "un logo", !shop.description && "une description", !shop.phone && !shop.whatsapp && "un numéro"].filter(Boolean);
  if (missing.length > 0) {
    alerts.push({ tone: "warn", text: `Votre page n'a pas encore ${missing.join(", ")}.`, href: "/pro/dashboard/boutique", cta: "Compléter" });
  }
  if (counts.rejected) {
    alerts.push({ tone: "warn", text: `${counts.rejected} annonce${counts.rejected > 1 ? "s" : ""} à corriger.`, href: "/pro/dashboard/annonces", cta: "Voir" });
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li
              key={i}
              className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed ${
                a.tone === "bad" ? "batta-tone-bad" : "batta-tone-warn"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{a.text}</span>
              {a.href && (
                <Link href={a.href as never} className="shrink-0 font-bold underline">
                  {a.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <Megaphone className="size-3.5" /> Annonces en ligne
          </h2>
          <p className="batta-tabular mt-2 text-[28px] font-black">
            {quota.used}
            <span className="text-[16px] font-bold text-muted"> / {quota.limit} {bucketWord}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            En vérification ou publiées. Les brouillons et les annonces retirées ne comptent pas.
          </p>
          <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target mt-3 inline-flex px-3.5 py-2 text-[12.5px]">
            <Plus className="size-4" /> Nouvelle annonce
          </Link>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <CalendarClock className="size-3.5" /> Abonnement
          </h2>
          {sub ? (
            <>
              <p className="mt-2 text-[20px] font-black">{planName}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {current
                  ? `Jusqu'au ${date(sub.ends_at)} — ${daysLeft} jour${daysLeft! > 1 ? "s" : ""} restant${daysLeft! > 1 ? "s" : ""}.`
                  : `Terminé le ${date(sub.ends_at)}.`}
              </p>
              {sub.reason === "migration" && (
                <p className="mt-1 text-[11.5px] text-muted">Offert à l&apos;ouverture des boutiques.</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Aucun abonnement.</p>
          )}
          <p className="mt-2 text-[11.5px] text-muted">Le renouvellement en ligne arrive bientôt.</p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <BadgeCheck className="size-3.5" /> Vérification
          </h2>
          <p className="mt-2 text-[14px] font-bold">
            {isShopVerified(shop)
              ? "Boutique vérifiée"
              : shop.verification_status === "pending"
                ? "Justificatifs en cours d'examen"
                : shop.verification_status === "rejected"
                  ? "Vérification refusée"
                  : "Non vérifiée"}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Le badge « Boutique vérifiée » est accordé par Mazed après contrôle de vos justificatifs.
            Il ne s&apos;achète pas.
          </p>
          {!isShopVerified(shop) && shop.verification_status !== "pending" && (
            <Link href={"/pro/dashboard/boutique#justificatifs" as never} className="mt-2 inline-block text-[12.5px] font-bold text-gold hover:underline">
              Envoyer mes justificatifs
            </Link>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <Eye className="size-3.5" /> Votre page
          </h2>
          <p className="mt-2 text-[14px] font-bold">
            {gate.enabled ? "Publique" : "Pas encore publique"}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {gate.enabled
              ? "Les acheteurs trouvent votre boutique dans l'annuaire et depuis chacune de vos annonces."
              : "Les pages boutiques ouvrent bientôt. Vous pouvez déjà voir la vôtre et la préparer."}
          </p>
          {shop.status === "active" && (
            <Link href={`/boutiques/${shop.slug}` as never} className="mt-2 inline-block text-[12.5px] font-bold text-gold hover:underline">
              Voir ma page
            </Link>
          )}
        </section>
      </div>

      <p className="text-[11.5px] text-muted">
        {counts.published ?? 0} publiée{(counts.published ?? 0) > 1 ? "s" : ""} · {counts.pending_review ?? 0} en vérification ·{" "}
        {counts.draft ?? 0} brouillon{(counts.draft ?? 0) > 1 ? "s" : ""} · {counts.expired ?? 0} expirée{(counts.expired ?? 0) > 1 ? "s" : ""}
      </p>
    </div>
  );
}
