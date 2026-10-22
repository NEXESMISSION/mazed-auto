"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  StatusPill, Confirm, SelectField, NumberField, TextareaField, FieldGrid,
  useAdminAction, EYEBROW, statusLabel, paymentKindLabel,
} from "@/components/admin/kit";
import {
  BadgeCheck, Ban, ChevronLeft, ExternalLink, FileText, Gift, RotateCcw, ShieldX, Store,
} from "lucide-react";

/**
 * The right pane: one shop — who runs it, its papers, its periods and
 * payments, its annonces, and everything decided about it. The four levers are
 * at the bottom (verify, refuse the verification, suspend, open); papers are
 * reviewed in place; a period can be given with a reason.
 */

export type ShopDetailData = {
  id: string; name: string; slug: string; activity: string; description: string | null;
  place: string; phone: string | null; whatsapp: string | null;
  status: string; verification: string; verifiedAt: string | null; rejectionReason: string | null;
  createdAt: string;
  owner: { id: string; name: string; phone: string | null };
  legal: { name: string | null; taxId: string | null; rne: string | null; address: string | null; email: string | null } | null;
  documents: { id: string; kind: string; status: string; note: string | null; createdAt: string }[];
  periods: { id: string; plan: string; startsAt: string; endsAt: string; graceEndsAt: string; status: string; origin: string }[];
  payments: { id: string; kind: string; amount: number; status: string; provider: string; createdAt: string; receipt: string | null }[];
  listings: Record<string, number>;
  plans: { code: string; label: string }[];
  audit: {
    id: string; at: string; entity: string; action: string; actor: string;
    before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null;
  }[];
};

const DOC_KIND: Record<string, string> = { rne: "Extrait RNE", patente: "Patente", cin_gerant: "CIN du gérant", autre: "Autre" };

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dtt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-[5px]">
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-[12.5px] text-foreground">{children}</dd>
    </div>
  );
}

/** One line of the trail, in words. */
function describe(a: ShopDetailData["audit"][number]): string {
  const b = a.before ?? {};
  const n = a.after ?? {};
  const change = (k: string) => (b[k] !== undefined && b[k] !== n[k] ? `${statusLabel(String(b[k]))} → ${statusLabel(String(n[k]))}` : null);
  if (a.entity === "shop") {
    if (a.action === "created") return "Boutique créée";
    const parts = [change("status") && `statut : ${change("status")}`, change("verification_status") && `vérification : ${change("verification_status")}`].filter(Boolean);
    return parts.join(" · ") || "Boutique modifiée";
  }
  if (a.entity === "subscription") {
    if (a.action === "created") {
      const end = typeof n.ends_at === "string" ? ` jusqu'au ${dt(n.ends_at)}` : "";
      return `Période ${n.payment_id ? "payée" : "offerte"}${end}`;
    }
    return `Période : ${change("status") ?? "modifiée"}`;
  }
  if (a.entity === "shop_document") {
    const kind = DOC_KIND[String(n.kind)] ?? "Justificatif";
    return a.action === "submitted" ? `${kind} envoyé` : `${kind} : ${statusLabel(String(n.status))}`;
  }
  if (a.entity === "listing") {
    const why = n.paused_reason ? ` (${String(n.paused_reason).replace("_", " ")})` : "";
    return `Annonce : ${change("status") ?? "modifiée"}${why}`;
  }
  return `${a.entity} · ${a.action}`;
}

export function ShopDetail({ shop, backHref }: { shop: ShopDetailData; backHref: string }) {
  const { run, pending } = useAdminAction();
  const [confirm, setConfirm] = useState<null | "suspend" | "reject" | { doc: string }>(null);
  const [granting, setGranting] = useState(false);
  const [plan, setPlan] = useState(shop.plans[0]?.code ?? "");
  const [days, setDays] = useState<number | null>(30);
  const [reason, setReason] = useState("");

  const s = shop;
  const act = (body: Record<string, unknown>, success: string) =>
    run({ url: `/api/admin/boutiques/${s.id}`, method: "POST", body, success });
  const live = (s.listings.published ?? 0) + (s.listings.pending_review ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-5 py-3.5">
        <Link href={backHref as "/admin/boutiques"} className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-subtle transition hover:text-foreground lg:hidden">
          <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={2.4} />
          Boutiques
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-[16px] font-semibold tracking-tight text-foreground">{s.name}</h1>
          <StatusPill status={s.status} />
          {s.verification === "verified" ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--gold)]">
              <BadgeCheck className="size-3.5" strokeWidth={2.4} /> Vérifiée
            </span>
          ) : (
            <StatusPill status={s.verification === "pending" ? "submitted" : s.verification} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
          <span>{s.activity}</span>
          <span>{s.place}</span>
          <span>créée le {dt(s.createdAt)}</span>
          <a href={`/fr/boutiques/${s.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-[var(--gold)] hover:underline">
            Vitrine <ExternalLink className="size-3" strokeWidth={2.2} />
          </a>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {s.rejectionReason && ["rejected", "suspended"].some((x) => x === s.status || x === s.verification) && (
          <p className="mb-3 border-s-2 border-[var(--tone-bad)] ps-3 text-[12.5px] text-[var(--tone-bad)]">
            <span className="font-semibold">Motif communiqué :</span> {s.rejectionReason}
          </p>
        )}

        <section>
          <h2 className={EYEBROW}>Responsable et coordonnées</h2>
          <dl className="mt-2">
            <Row label="Propriétaire">
              <Link href={`/admin/vendeurs?a=${s.owner.id}` as "/admin/vendeurs"} className="font-medium text-[var(--gold)] hover:underline">
                {s.owner.name}
              </Link>
              {s.owner.phone && <span className="text-subtle"> · {s.owner.phone}</span>}
            </Row>
            <Row label="Téléphone boutique">{s.phone ?? <span className="text-subtle">non renseigné</span>}</Row>
            <Row label="WhatsApp">{s.whatsapp ?? <span className="text-subtle">—</span>}</Row>
            {s.description && <Row label="Présentation"><span className="line-clamp-3">{s.description}</span></Row>}
          </dl>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>Informations légales (privées)</h2>
          {s.legal && Object.values(s.legal).some(Boolean) ? (
            <dl className="mt-2">
              <Row label="Raison sociale">{s.legal.name ?? "—"}</Row>
              <Row label="Matricule fiscal">{s.legal.taxId ?? "—"}</Row>
              <Row label="RNE">{s.legal.rne ?? "—"}</Row>
              <Row label="Adresse légale">{s.legal.address ?? "—"}</Row>
              <Row label="E-mail">{s.legal.email ?? "—"}</Row>
            </dl>
          ) : (
            <p className="mt-2 text-[12px] text-subtle">Non renseignées.</p>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>Justificatifs</h2>
          {s.documents.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">Aucun justificatif envoyé.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70">
              {s.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-[12.5px]">
                  <FileText className="size-3.5 shrink-0 text-subtle" />
                  <span className="font-medium text-foreground">{DOC_KIND[d.kind] ?? d.kind}</span>
                  <StatusPill status={d.status} />
                  <span className="text-[11.5px] text-subtle">{dt(d.createdAt)}</span>
                  <a
                    href={`/api/admin/boutiques/${s.id}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] hover:underline"
                  >
                    Ouvrir <ExternalLink className="size-3" strokeWidth={2.2} />
                  </a>
                  {d.status === "submitted" && (
                    <span className="ms-auto flex gap-1.5">
                      <AdminButton size="sm" pending={pending} onClick={() => act({ action: "review_document", document_id: d.id, status: "accepted" }, "Justificatif accepté.")}>
                        Accepter
                      </AdminButton>
                      <AdminButton size="sm" variant="quiet" onClick={() => setConfirm({ doc: d.id })}>
                        Refuser
                      </AdminButton>
                    </span>
                  )}
                  {d.note && <p className="w-full text-[11.5px] text-subtle">Motif : {d.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-subtle">Chaque ouverture crée un lien valable 60 secondes, et elle est journalisée.</p>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className={EYEBROW}>Abonnement</h2>
            <AdminButton size="sm" icon={<Gift className="size-3.5" strokeWidth={2.4} />} onClick={() => setGranting(!granting)}>
              Offrir une période
            </AdminButton>
          </div>
          {granting && (
            <div className="mt-3 space-y-3.5 border-s-2 border-[var(--gold)] ps-4">
              <p className="text-[11.5px] text-subtle">
                Geste commercial, virement reçu hors du site, correction : la période suit les règles d&apos;une période payée
                (elle commence à la fin de celle en cours) et elle est enregistrée à votre nom.
              </p>
              <FieldGrid>
                <SelectField label="Formule" value={plan} onChange={setPlan} options={s.plans.map((p) => ({ value: p.code, label: p.label }))} />
                <NumberField label="Durée" value={days} onChange={setDays} min={1} suffix="jours" />
              </FieldGrid>
              <TextareaField label="Motif" value={reason} onChange={setReason} rows={2} />
              <div className="flex justify-end gap-2">
                <AdminButton variant="quiet" onClick={() => setGranting(false)}>Annuler</AdminButton>
                <AdminButton
                  variant="primary"
                  pending={pending}
                  disabled={!plan || !days || !reason.trim()}
                  disabledReason="Formule, durée et motif."
                  onClick={async () => {
                    if (await act({ action: "grant_period", plan_code: plan, days, reason }, "Période offerte.")) {
                      setGranting(false);
                      setReason("");
                    }
                  }}
                >
                  Offrir
                </AdminButton>
              </div>
            </div>
          )}
          {s.periods.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">Aucune période.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {s.periods.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                  <span className="font-medium text-foreground">{p.plan}</span>
                  <span className="text-subtle">{dt(p.startsAt)} → {dt(p.endsAt)}</span>
                  <StatusPill status={p.status === "grace" ? "pending" : p.status === "active" ? "active" : "expired"}>
                    {p.status === "grace" ? "Grâce" : p.status === "active" ? "Active" : p.status === "expired" ? "Terminée" : p.status}
                  </StatusPill>
                  <span className="ms-auto text-[11.5px] text-subtle">{p.origin}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>Paiements</h2>
          {s.payments.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">Aucun paiement.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {s.payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/paiements?a=${p.id}` as "/admin/paiements"} className="flex flex-wrap items-center gap-x-3 py-1.5 hover:text-[var(--gold)]">
                    <span className="font-medium">{paymentKindLabel(p.kind)}</span>
                    <span className="batta-tabular">{p.amount.toFixed(3)} TND</span>
                    <StatusPill status={p.status} />
                    <span className="text-[11.5px] text-subtle">{p.provider === "konnect" ? "Konnect" : "virement / D17"} · {dt(p.createdAt)}</span>
                    {p.receipt && <span className="ms-auto text-[11.5px] text-subtle">{p.receipt}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>Annonces</h2>
          <p className="mt-2 text-[12.5px]">
            <Link href={`/admin/annonces?status=all&q=${encodeURIComponent(s.owner.phone ?? s.name)}` as "/admin/annonces"} className="inline-flex items-center gap-1.5 font-medium text-[var(--gold)] hover:underline">
              {live} en ligne ou en vérification · {Object.values(s.listings).reduce((a, b) => a + b, 0)} au total
              <ExternalLink className="size-3" strokeWidth={2.2} />
            </Link>
          </p>
          {Object.keys(s.listings).length > 0 && (
            <p className="mt-1 text-[11.5px] text-subtle">
              {Object.entries(s.listings).map(([k, v]) => `${statusLabel(k)} ${v}`).join(" · ")}
            </p>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>Historique</h2>
          {s.audit.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">Rien d&apos;enregistré.</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {s.audit.map((a) => (
                <li key={a.id} className="grid grid-cols-[96px_1fr] gap-3 text-[12px]">
                  <span className="text-[11px] text-subtle">{dtt(a.at)}</span>
                  <span className="min-w-0">
                    <span className="text-foreground">{describe(a)}</span>
                    <span className="text-subtle"> — {a.actor}</span>
                    {a.reason && <span className="block text-[11.5px] text-subtle">« {a.reason} »</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-5 py-3">
        {s.verification !== "verified" && (
          <AdminButton
            icon={<BadgeCheck className="size-3.5" strokeWidth={2.4} />}
            pending={pending}
            onClick={() => act({ action: "verify" }, "Boutique vérifiée.")}
          >
            Vérifier
          </AdminButton>
        )}
        {s.verification !== "rejected" && s.verification !== "unverified" && (
          <AdminButton variant="quiet" icon={<ShieldX className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("reject")}>
            {s.verification === "verified" ? "Retirer la vérification" : "Refuser la vérification"}
          </AdminButton>
        )}
        {s.status === "active" ? (
          <AdminButton variant="quiet" className="ms-auto" icon={<Ban className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("suspend")}>
            Suspendre
          </AdminButton>
        ) : s.status !== "closed" ? (
          <AdminButton
            variant="quiet"
            className="ms-auto"
            pending={pending}
            icon={s.status === "suspended" ? <RotateCcw className="size-3.5" strokeWidth={2.4} /> : <Store className="size-3.5" strokeWidth={2.4} />}
            onClick={() => act({ action: "activate" }, "Boutique en ligne.")}
          >
            {s.status === "suspended" ? "Réactiver" : "Ouvrir la boutique"}
          </AdminButton>
        ) : null}
      </footer>

      <Confirm
        open={confirm === "suspend"}
        title="Suspendre cette boutique ?"
        body="Sa page et ses annonces ne sont plus proposées. Rien n'est supprimé ; le propriétaire voit le motif."
        confirmLabel="Suspendre"
        pending={pending}
        reason={{ label: "Motif (communiqué au propriétaire)", placeholder: "Annonces trompeuses, plainte…", required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (await act({ action: "suspend", reason: r }, "Boutique suspendue.")) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "reject"}
        title={s.verification === "verified" ? "Retirer le badge « vérifiée » ?" : "Refuser la vérification ?"}
        body="Le badge n'apparaît plus. La boutique reste en ligne et peut envoyer de nouveaux justificatifs."
        confirmLabel={s.verification === "verified" ? "Retirer" : "Refuser"}
        pending={pending}
        reason={{ label: "Motif (communiqué au propriétaire)", placeholder: "Document illisible, nom différent…", required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (await act({ action: "reject_verification", reason: r }, "Vérification refusée.")) setConfirm(null);
        }}
      />
      <Confirm
        open={typeof confirm === "object" && confirm !== null}
        title="Refuser ce justificatif ?"
        body="Le propriétaire est prévenu et peut en envoyer un autre."
        confirmLabel="Refuser"
        pending={pending}
        reason={{ label: "Motif (communiqué au propriétaire)", placeholder: "Illisible, expiré…", required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (typeof confirm === "object" && confirm !== null) {
            if (await act({ action: "review_document", document_id: confirm.doc, status: "rejected", note: r }, "Justificatif refusé.")) setConfirm(null);
          }
        }}
      />
    </div>
  );
}
