import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { formatTND } from "@/lib/utils";
import { CheckCircle2, ArrowRight, Loader2, XCircle, RotateCcw } from "lucide-react";
import { SuccessAutoRedirect } from "./SuccessAutoRedirect";

export const dynamic = "force-dynamic";

/**
 * What the payment was for. The v3 kinds (listing_fee, listing_pack, renewal,
 * promo, badge) were missing entirely, so every publication fee — the only
 * payment this product actually takes — fell through to the generic
 * "Paiement reçu".
 */
const KIND_LABEL: Record<string, string> = {
  listing_fee: "Annonce payée",
  listing_pack: "Pack d'annonces",
  renewal: "Renouvellement payé",
  promo: "Mise en avant payée",
  badge: "Badge vérifié",
  subscription: "Abonnement activé",
};

const KIND_SUBLABEL: Record<string, string> = {
  listing_fee: "Votre annonce part en vérification — moins de 24 h.",
  listing_pack: "Vos publications sont créditées sur votre compte.",
  renewal: "Votre annonce est de nouveau en ligne.",
  promo: "Votre annonce est mise en avant.",
  badge: "Votre badge vérifié est actif.",
  subscription: "Votre abonnement est actif.",
};

/**
 * What the payment is FOR, as a plain noun.
 *
 * KIND_LABEL above is phrased as a completed action ("Annonce payée"), which
 * is right for the headline of a confirmed payment and wrong everywhere else:
 * the summary row on a REFUSED payment was reading "Objet · Annonce payée".
 */
const KIND_NOUN: Record<string, string> = {
  listing_fee: "Publication d'annonce",
  listing_pack: "Pack d'annonces",
  renewal: "Renouvellement",
  promo: "Mise en avant",
  badge: "Badge vérifié",
  subscription: "Abonnement",
};

type Tone = "ok" | "wait" | "bad" | "neutral";

/**
 * The whole point of this rewrite.
 *
 * The page used to ask one question — `status === "captured"` — and treat
 * everything else as "en attente de confirmation". So a REFUSED payment was
 * announced as "Paiement reçu · Nous avons enregistré votre paiement", under a
 * spinner, with the raw English word "failed" as the only clue. A seller read
 * that as "it went through, they are checking it" and waited for something
 * that had already died.
 *
 * Five statuses exist in the enum. Each one now says what it means, in French,
 * and offers the action that actually applies to it.
 */
type View = {
  tone: Tone;
  eyebrow: string;
  title: string;
  body: string;
  /** Only a confirmed payment sends the user onward by itself. */
  autoRedirect: boolean;
};

function viewFor(status: string, kind: string): View {
  const kindLabel = KIND_LABEL[kind] ?? "Paiement reçu";
  const kindSub = KIND_SUBLABEL[kind] ?? "Nous avons enregistré votre paiement.";

  switch (status) {
    case "captured":
      return {
        tone: "ok",
        eyebrow: "Paiement confirmé",
        title: kindLabel,
        body: kindSub,
        autoRedirect: true,
      };

    case "failed":
      return {
        tone: "bad",
        eyebrow: "Paiement refusé",
        title: "Ce paiement n'a pas abouti",
        body:
          "Rien n'a été confirmé et votre annonce n'a pas été publiée. " +
          "Reprenez le paiement depuis « Mes annonces », ou contactez-nous si vous pensez qu'il s'agit d'une erreur.",
        autoRedirect: false,
      };

    case "refunded":
      return {
        tone: "neutral",
        eyebrow: "Paiement remboursé",
        title: "Ce paiement a été remboursé",
        body: "La somme vous a été rendue. Rien n'est dû pour cette opération.",
        autoRedirect: false,
      };

    case "pending_review":
      return {
        tone: "wait",
        eyebrow: "Reçu en cours de vérification",
        title: "Nous vérifions votre reçu",
        body:
          "Votre virement est entre nos mains. Nous confirmons sous 24 h en général, " +
          "et vous recevez un message dès que c'est validé — vous n'avez rien d'autre à faire.",
        autoRedirect: false,
      };

    case "authorized":
      return {
        tone: "wait",
        eyebrow: "En attente de confirmation",
        title: "Paiement autorisé",
        body: "Le montant est réservé. La confirmation définitive arrive sous peu.",
        autoRedirect: false,
      };

    // `pending` and anything the enum gains later.
    default:
      return {
        tone: "wait",
        eyebrow: "En attente de paiement",
        title: "Ce paiement n'est pas encore réglé",
        body:
          "Nous n'avons pas encore reçu votre règlement. Reprenez-le depuis « Mes annonces » " +
          "pour téléverser votre reçu.",
        autoRedirect: false,
      };
  }
}

/** The status word itself, in French — it was printing the raw enum. */
const STATUS_LABEL: Record<string, string> = {
  captured: "Validé",
  pending: "En attente",
  pending_review: "En vérification",
  authorized: "Autorisé",
  refunded: "Remboursé",
  failed: "Refusé",
};

const TONE_PILL: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  wait: "bg-amber-500/15 text-amber-300",
  bad: "bg-[rgba(239,68,68,0.15)] text-[#ef8681]",
  neutral: "bg-surface text-muted",
};

/**
 * Post-payment page. Shows the transaction summary, says plainly where the
 * payment stands, and auto-redirects only when there is genuinely nothing
 * left to do.
 */
export default async function PaymentSuccess({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; return?: string }>;
}) {
  const { id, return: returnUrl } = await searchParams;
  const locale = await getLocale();
  const safeReturn = returnUrl && returnUrl.startsWith("/") ? returnUrl : "/";

  if (!id) {
    return (
      <SuccessShell
        title="Paiement reçu"
        body="Nous avons enregistré votre paiement. Vous serez notifié dès que tout est confirmé."
        returnUrl={safeReturn}
      />
    );
  }

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=/payment/success?id=${id}`);
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, kind, amount, status, currency, created_at, auction_id")
    .eq("id", id)
    .maybeSingle();

  if (!payment) {
    return (
      <SuccessShell
        title="Reçu introuvable"
        body="Nous n'avons pas trouvé ce paiement. Si la somme a été débitée, contactez le support avec le numéro de référence ci-dessous."
        returnUrl={safeReturn}
        id={id}
      />
    );
  }

  const status = String(payment.status);
  const kind = String(payment.kind);
  const view = viewFor(status, kind);

  // Where "continue" goes. A payment that failed or is still owed belongs in
  // Mes annonces, which is where the seller can act on it — not on a lot page
  // and not on the home page.
  const needsSellerAction = view.tone === "bad" || status === "pending";
  const dest = (
    needsSellerAction
      ? "/account/listings"
      : returnUrl && returnUrl.startsWith("/")
        ? returnUrl
        : payment.auction_id
          ? `/auctions/${payment.auction_id}`
          : safeReturn
  ) as `/${string}`;

  const ctaLabel = needsSellerAction
    ? "Reprendre depuis mes annonces"
    : view.tone === "ok"
      ? "Continuer"
      : "Retour";

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--desktop-nav-h))] w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <SuccessAutoRedirect to={dest} delayMs={1800} enabled={view.autoRedirect} />
      <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <div className="relative mx-auto h-16 w-16">
          {view.tone === "ok" && (
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" aria-hidden />
          )}
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full ${
              view.tone === "ok"
                ? "bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                : view.tone === "bad"
                  ? "bg-[rgba(239,68,68,0.15)] text-[#ef8681] ring-1 ring-[rgba(239,68,68,0.40)]"
                  : view.tone === "neutral"
                    ? "bg-surface-2 text-muted ring-1 ring-border"
                    : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
            }`}
          >
            {view.tone === "ok" ? (
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.2} />
            ) : view.tone === "bad" ? (
              <XCircle className="h-9 w-9" strokeWidth={2.2} />
            ) : view.tone === "neutral" ? (
              <RotateCcw className="h-7 w-7" strokeWidth={2.2} />
            ) : (
              // A spinner promises movement. It belongs on a payment that is
              // genuinely still being processed, and nowhere else.
              <Loader2 className="h-7 w-7 animate-spin" />
            )}
          </div>
        </div>

        <div
          className={`mt-5 text-[10px] font-extrabold uppercase tracking-[0.18em] ${
            view.tone === "bad" ? "text-[#ef8681]" : "text-[var(--gold)]"
          }`}
        >
          {view.eyebrow}
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{view.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">{view.body}</p>

        <dl className="mt-6 space-y-2 rounded-[var(--radius)] bg-[var(--surface-2)] p-4 text-start">
          <Row label="Montant">
            <span className="batta-tabular gradient-gold-text font-bold">
              {formatTND(Number(payment.amount), locale)} {payment.currency}
            </span>
          </Row>
          <Row label="Objet">
            <span className="text-[12px] text-foreground">
              {KIND_NOUN[kind] ?? "Paiement"}
            </span>
          </Row>
          <Row label="Référence">
            <span className="font-mono text-[11px] text-foreground">
              {payment.id.slice(0, 8)}…{payment.id.slice(-4)}
            </span>
          </Row>
          <Row label="Date">
            <span className="font-mono text-[11px] text-foreground">
              {new Date(payment.created_at).toLocaleString("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </Row>
          <Row label="Statut">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE_PILL[view.tone]}`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
          </Row>
        </dl>

        {view.autoRedirect && (
          <p className="mt-5 inline-flex items-center justify-center gap-1.5 text-[11px] text-[var(--foreground-subtle)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Redirection automatique…
          </p>
        )}

        <Link
          href={dest}
          className={
            view.tone === "ok" || needsSellerAction
              ? "mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-gradient-to-b from-[var(--gold-bright)] to-[var(--gold)] text-[14px] font-bold text-foreground shadow-[var(--shadow-gold)] transition-all active:scale-[0.99]"
              : "mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] text-[14px] font-semibold text-foreground transition-colors hover:border-[var(--gold-soft)]"
          }
        >
          {ctaLabel}
          {(view.tone === "ok" || needsSellerAction) && <ArrowRight className="h-4 w-4" />}
        </Link>

        <p className="mt-4 text-[11.5px] text-[var(--foreground-subtle)]">
          Vous rencontrez un problème ?{" "}
          <Link href="/contact" className="font-semibold text-[var(--gold)] hover:underline">
            Contacter le support
          </Link>
        </p>
      </div>
    </div>
  );
}

function SuccessShell({
  title,
  body,
  returnUrl,
  id,
}: {
  title: string;
  body: string;
  returnUrl: string;
  id?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--desktop-nav-h))] w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--gold-faint)]">
          <CheckCircle2 className="h-7 w-7 text-[var(--gold)]" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">{body}</p>
        {id && (
          <p className="mt-3 font-mono text-[10px] text-[var(--foreground-subtle)]">Réf · {id}</p>
        )}
        <Link
          href={returnUrl as `/${string}`}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] font-semibold text-foreground transition-colors hover:border-[var(--gold-soft)]"
        >
          Retour
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--foreground-muted)]">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
