import { Link } from "@/i18n/navigation";
import { accountLabelFromEmail } from "@/lib/identity";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminPage, EYEBROW } from "@/components/admin/kit";
import { actionLabel } from "@/lib/admin/actions";
import { AlertTriangle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The triage dashboard — what is waiting on a decision, right now.
 *
 * The previous version counted six queues, five of which read tables holding
 * zero rows, and the sixth linked to a page deleted in Phase 6a — a
 * live-looking "2" pointing at a 404. A dashboard whose numbers cannot move
 * teaches you to ignore it.
 *
 * It is also, deliberately, no longer a grid of cards. Six bordered rounded
 * tiles gave six numbers equal weight and equal decoration; a figure with a
 * label under it and a rule between reads faster and says more, because
 * nothing is competing with the number. Every count is head-only — nothing on
 * this page fetches a list except the audit strip at the bottom.
 */

const OVERDUE_MS = 48 * 3_600_000;
const EXPIRING_MS = 7 * 24 * 3_600_000;

export default async function AdminDashboard() {
  const sb = await getServerSupabase();

  const now = Date.now();
  const overdue = new Date(now - OVERDUE_MS).toISOString();
  const soon = new Date(now + EXPIRING_MS).toISOString();
  const nowIso = new Date().toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = dayStart.toISOString();

  const head = (t: string) => sb.from(t).select("*", { count: "exact", head: true });

  const [
    listingsPending, listingsOverdue, listingsToday,
    paymentsPending, paymentsOverdue,
    expiringSoon, expired,
    recent,
  ] = await Promise.all([
    head("listings").eq("status", "pending_review"),
    head("listings").eq("status", "pending_review").lt("created_at", overdue),
    head("listings").eq("status", "published").gte("published_at", today),
    head("payments").eq("status", "pending_review"),
    head("payments").eq("status", "pending_review").lt("created_at", overdue),
    head("listings").eq("status", "published").not("expires_at", "is", null)
      .gte("expires_at", nowIso).lte("expires_at", soon),
    head("listings").eq("status", "expired"),
    // `action is not null` is what separates a real decision from page-view
    // telemetry — 16 836 of the 17 034 rows in this table were the latter,
    // which is why the journal was unreadable without it. Admin navigation no
    // longer writes page views at all (see middleware), so the gap closes.
    //
    // Not-null was necessary but not sufficient: with it, the panel still read
    // "client.window.onerror · server.render · server.render" — browser error
    // reports and render traces, which are observability, not gestures. An
    // admin opens "Derniers gestes" to see who approved, refused or refunded
    // what. The `client.` and `server.` namespaces are the telemetry ones;
    // everything else (listing.*, payment.*, home.*, user.*, kyc.*) is a
    // decision somebody made.
    sb.from("activity_log")
      .select("id, created_at, action, user_email")
      .not("action", "is", null)
      .not("action", "like", "client.%")
      .not("action", "like", "server.%")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  const queues = [
    {
      label: "Annonces à valider",
      sub: "Soumises par un vendeur",
      href: "/admin/annonces?status=pending_review",
      count: n(listingsPending),
      overdue: n(listingsOverdue),
    },
    {
      label: "Reçus à valider",
      sub: "Publication, packs, mises en avant",
      href: "/admin/paiements",
      count: n(paymentsPending),
      overdue: n(paymentsOverdue),
    },
    {
      label: "Expirent sous 7 jours",
      sub: "À relancer pour un renouvellement",
      href: "/admin/annonces?status=expiring",
      count: n(expiringSoon),
      overdue: 0,
    },
    {
      label: "Expirées",
      sub: "Hors ligne, renouvelables",
      href: "/admin/annonces?status=expired",
      count: n(expired),
      overdue: 0,
    },
  ];

  const totalPending = n(listingsPending) + n(paymentsPending);
  const totalOverdue = n(listingsOverdue) + n(paymentsOverdue);

  return (
    <AdminPage>
      <header>
        <span className={EYEBROW}>Console</span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
          Tableau de bord
        </h1>
      </header>

      {/* Three figures, separated by rules. No tiles. */}
      <div className="mt-7 grid grid-cols-3 border-y border-border">
        <Figure label="En attente" value={totalPending} accent={totalPending > 0} />
        <Figure
          label="En retard > 48 h"
          value={totalOverdue}
          danger={totalOverdue > 0}
          className="border-s border-border"
        />
        <Figure
          label="Publiées aujourd'hui"
          value={n(listingsToday)}
          className="border-s border-border"
        />
      </div>

      <section className="mt-9">
        <h2 className={EYEBROW}>Files</h2>
        <ul className="mt-2 border-t border-border">
          {queues.map((qq) => (
            <li key={qq.href}>
              <Link
                href={qq.href as "/admin/annonces"}
                className="group flex items-center gap-4 border-b border-border py-3 transition hover:bg-[rgba(255,255,255,0.025)]"
              >
                <span
                  className={`batta-tabular w-10 shrink-0 text-end text-[19px] font-semibold ${
                    qq.count > 0 ? "text-foreground" : "text-subtle"
                  }`}
                >
                  {qq.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {qq.label}
                  </span>
                  <span className="block truncate text-[11.5px] text-subtle">{qq.sub}</span>
                </span>
                {qq.overdue > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-[#ef8681]">
                    <AlertTriangle className="size-3" strokeWidth={2.6} />
                    {qq.overdue} en retard
                  </span>
                )}
                <ArrowRight
                  className="size-3.5 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-[var(--gold)]"
                  strokeWidth={2}
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-9">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={EYEBROW}>Derniers gestes</h2>
          <Link
            href={"/admin/activity" as "/admin"}
            className="text-[11.5px] font-medium text-subtle transition hover:text-foreground"
          >
            Tout le journal →
          </Link>
        </div>
        {recent.data && recent.data.length > 0 ? (
          <ul className="mt-2 border-t border-border">
            {recent.data.map((r) => (
              <li
                key={r.id as string}
                className="flex items-baseline gap-4 border-b border-border py-2"
              >
                <span className="batta-tabular w-24 shrink-0 text-[11.5px] text-subtle">
                  {relative(r.created_at as string)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {actionLabel(r.action as string)}
                </span>
                <span className="hidden shrink-0 text-[11.5px] text-subtle sm:block">
                  {accountLabelFromEmail(r.user_email as string | null) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-border pt-3 text-[12.5px] text-subtle">
            Aucune action enregistrée pour l'instant.
          </p>
        )}
      </section>
    </AdminPage>
  );
}

function Figure({
  label,
  value,
  accent = false,
  danger = false,
  className = "",
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <div className={`py-4 ps-4 first:ps-0 ${className}`}>
      <div className={EYEBROW}>{label}</div>
      <div
        className={`batta-tabular mt-1.5 text-[30px] font-semibold leading-none ${
          danger ? "text-[#ef8681]" : accent ? "text-[var(--gold)]" : "text-foreground"
        }`}
      >
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

/** "il y a 4 min" / "il y a 3 h" / "il y a 2 j" — short enough for a column. */
function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
