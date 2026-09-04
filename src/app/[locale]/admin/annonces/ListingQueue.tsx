"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { formatTND } from "@/lib/utils";
import { Check, X, Archive, Phone, MapPin, ImageOff, Ticket, Wallet, Gift, Stethoscope } from "lucide-react";
import { DiagnosticEditor } from "@/components/admin/DiagnosticEditor";
import type { Diagnostic } from "@/lib/diagnostics";

export type QueueListing = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  negotiable: boolean;
  governorate: string;
  status: string;
  condition: string | null;
  category: string;
  categoryKind: string;
  sellerName: string;
  sellerPhone: string | null;
  contactName: string | null;
  contactPhone: string | null;
  attributes: Record<string, unknown>;
  rejectionReason: string | null;
  paidWith: "credit" | "payment" | "waived";
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  /** Our own inspection sheet for this annonce, draft or published. */
  diagnostic: Diagnostic | null;
  /** The publication fee and any receipt the seller sent for it. */
  payment: { amount: number; status: string; receipts: string[]; uploadedAt: string | null } | null;
  photos: string[];
};

const STATUS: Record<string, { label: string; tone: string }> = {
  pending_review:  { label: "À vérifier",       tone: "batta-tone-warn" },
  pending_payment: { label: "En attente de paiement", tone: "bg-surface-2 text-muted ring-1 ring-border" },
  draft:           { label: "Brouillon",        tone: "bg-surface-2 text-muted ring-1 ring-border" },
  published:       { label: "En ligne",         tone: "batta-tone-ok" },
  rejected:        { label: "Refusée",          tone: "batta-tone-bad" },
  expired:         { label: "Expirée",          tone: "bg-surface-2 text-muted ring-1 ring-border" },
  sold:            { label: "Vendue",           tone: "batta-tone-ok" },
  archived:        { label: "Archivée",         tone: "bg-surface-2 text-muted ring-1 ring-border" },
};

const PAID_WITH: Record<QueueListing["paidWith"], { label: string; Icon: typeof Ticket }> = {
  credit:  { label: "forfait",  Icon: Ticket },
  payment: { label: "payée",    Icon: Wallet },
  waived:  { label: "offerte",  Icon: Gift },
};

const FILTERS = [
  ["pending_review", "À vérifier"],
  ["pending_payment", "En attente"],
  ["published", "En ligne"],
  ["rejected", "Refusées"],
  ["all", "Toutes"],
] as const;

export function ListingQueue({
  listings,
  counts,
  activeStatus,
}: {
  listings: QueueListing[];
  counts: Record<string, number>;
  activeStatus: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function act(id: string, body: Record<string, unknown>, ok: string) {
    start(async () => {
      const res = await fetch(`/api/admin/annonces/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.detail ?? j.error ?? "Échec de l'action.", "error");
        return;
      }
      const j = await res.json().catch(() => ({}));
      toast(j.creditReturned ? `${ok} La publication a été rendue au vendeur.` : ok, "success");
      setRejecting(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={{ pathname: "/admin/annonces", query: value === "all" ? {} : { status: value } }}
            className={
              "rounded-full px-3 py-1.5 text-[12px] font-bold transition " +
              (activeStatus === value
                ? "bg-[var(--gold)] text-white"
                : "bg-surface text-muted ring-1 ring-border hover:text-foreground")
            }
          >
            {label}
            {counts[value] ? ` · ${counts[value]}` : ""}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2/40 p-6 text-center text-[13px] text-muted">
          Rien dans cette file.
        </p>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const st = STATUS[l.status] ?? { label: l.status, tone: "bg-surface-2 text-muted" };
            const paid = PAID_WITH[l.paidWith];
            const actionable = l.status === "pending_review";
            return (
              <article key={l.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap gap-4">
                  {/* Photo strip — moderation is mostly looking at pictures. */}
                  <div className="flex gap-1.5">
                    {l.photos.length === 0 ? (
                      <span className="grid size-20 place-items-center rounded-xl bg-surface-2 text-muted ring-1 ring-border">
                        <ImageOff className="size-5" />
                      </span>
                    ) : (
                      l.photos.slice(0, 3).map((p, i) => (
                        <ImageLightbox
                          key={p}
                          src={propertyPhotoUrl(p)}
                          alt={`${l.title} ${i + 1}`}
                          triggerClassName="relative size-20 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={propertyPhotoUrl(p)} alt="" className="size-full bg-black object-contain" />
                        </ImageLightbox>
                      ))
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                        {st.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-muted ring-1 ring-border">
                        <paid.Icon className="size-3" /> {paid.label}
                      </span>
                      <span className="text-[11px] text-muted">{l.category}</span>
                    </div>

                    <h3 className="mt-1 text-[15px] font-extrabold text-foreground">{l.title}</h3>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span className="batta-tabular font-bold text-foreground">
                        {l.price != null ? `${formatTND(l.price, "fr")} TND` : "prix sur demande"}
                        {l.negotiable && <span className="ms-1 font-normal text-muted">négociable</span>}
                      </span>
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {l.governorate}</span>
                      <span>{l.sellerName}</span>
                      {l.contactPhone && (
                        <a href={`tel:${l.contactPhone}`} className="inline-flex items-center gap-1 font-semibold text-gold hover:underline">
                          <Phone className="size-3" /> {l.contactPhone}
                        </a>
                      )}
                    </div>

                    {l.description && (
                      <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/80">
                        {l.description}
                      </p>
                    )}

                    {l.rejectionReason && (
                      <p className="mt-2 rounded-lg bg-[var(--accent-faint)] px-2.5 py-1.5 text-[11.5px] text-[var(--accent-deep)]">
                        Motif du refus : {l.rejectionReason}
                      </p>
                    )}

                    {l.status === "published" && l.expiresAt && (
                      <p className="mt-2 text-[11.5px] text-muted">
                        En ligne jusqu&apos;au {new Date(l.expiresAt).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Diagnostic Mazed — written here, because the moment someone
                    is already looking at the photos and the papers is the moment
                    to write down what they saw. Publishing the sheet is what
                    puts the badge on the annonce. */}
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-muted hover:text-foreground">
                    <Stethoscope className="size-3.5" />
                    Diagnostic Mazed
                    {l.diagnostic ? (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] " +
                          (l.diagnostic.status === "published"
                            ? "batta-tone-ok"
                            : "bg-surface-2 text-muted ring-1 ring-border")
                        }
                      >
                        {l.diagnostic.status === "published" ? "publié" : "brouillon"}
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-semibold text-muted">— aucun</span>
                    )}
                  </summary>
                  <div className="mt-3">
                    <DiagnosticEditor propertyId={l.id} initial={l.diagnostic} />
                  </div>
                </details>

                {/* ── The money, where the annonce is ──────────────────────
                    A listing fee never appeared in the payments console: that
                    one groups by auction_id and only covers deposit_lock,
                    buy_now and final_payment (0081). So a seller could send a
                    receipt and nobody would ever see it. It belongs on the row
                    the decision is about anyway. */}
                {l.status === "pending_payment" && (
                  <div className="mt-3 rounded-xl border border-[var(--gold-soft)] bg-gold-faint/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-gold">
                        <Wallet className="size-3.5" />
                        Frais de publication
                        {l.payment ? ` · ${l.payment.amount} TND` : ""}
                      </span>
                      {l.payment?.uploadedAt ? (
                        <span className="text-[11.5px] text-muted">
                          Reçu envoyé le {new Date(l.payment.uploadedAt).toLocaleDateString("fr-FR")}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-muted">Aucun reçu envoyé</span>
                      )}
                    </div>

                    {(l.payment?.receipts.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {l.payment!.receipts.map((url, i) => (
                          <ImageLightbox
                            key={url}
                            src={url}
                            alt={`Reçu ${i + 1}`}
                            triggerClassName="relative size-16 overflow-hidden rounded-lg bg-black ring-1 ring-border"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="size-full object-contain" />
                          </ImageLightbox>
                        ))}
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <AdminButton
                        variant="success"
                        pending={pending}
                        onClick={() => act(l.id, { action: "mark_paid" }, "Paiement enregistré.")}
                      >
                        <Check className="size-3.5" /> Paiement reçu
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        pending={pending}
                        onClick={() => act(l.id, { action: "waive_fee" }, "Publication offerte.")}
                      >
                        <Gift className="size-3.5" /> Publier sans paiement
                      </AdminButton>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">
                      Les deux envoient l&apos;annonce en vérification — elle n&apos;est pas
                      publiée sans votre validation.
                    </p>
                  </div>
                )}

                {(actionable || l.status === "published") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {actionable && rejecting !== l.id && (
                      <>
                        <AdminButton
                          variant="success"
                          pending={pending}
                          onClick={() => act(l.id, { action: "approve" }, "Annonce publiée.")}
                        >
                          <Check className="size-3.5" /> Publier
                        </AdminButton>
                        <AdminButton variant="dangerSoft" onClick={() => setRejecting(l.id)}>
                          <X className="size-3.5" /> Refuser
                        </AdminButton>
                      </>
                    )}

                    {rejecting === l.id && (
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <input
                          autoFocus
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Ce que le vendeur doit corriger"
                          className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
                        />
                        <AdminButton
                          variant="danger"
                          pending={pending}
                          disabled={!reason.trim()}
                          disabledReason={!reason.trim() ? "Indiquez le motif" : undefined}
                          onClick={() => act(l.id, { action: "reject", reason: reason.trim() }, "Annonce refusée.")}
                        >
                          Envoyer le refus
                        </AdminButton>
                        <AdminButton variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>
                          Annuler
                        </AdminButton>
                      </div>
                    )}

                    {l.status === "published" && (
                      <AdminButton
                        variant="warnSoft"
                        pending={pending}
                        onClick={() => act(l.id, { action: "archive" }, "Annonce retirée.")}
                      >
                        <Archive className="size-3.5" /> Retirer
                      </AdminButton>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
